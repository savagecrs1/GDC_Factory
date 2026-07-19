package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// redisPool is a tiny connection pool implementing just the RESP commands
// this service needs (GET / SET), with no external dependencies.
type redisPool struct {
	addr  string
	max   int
	mu    sync.Mutex
	conns []net.Conn
}

func newRedisPool(addr string, max int) *redisPool {
	return &redisPool{addr: addr, max: max}
}

func (p *redisPool) get() (net.Conn, error) {
	p.mu.Lock()
	if n := len(p.conns); n > 0 {
		c := p.conns[n-1]
		p.conns = p.conns[:n-1]
		p.mu.Unlock()
		return c, nil
	}
	p.mu.Unlock()
	return net.DialTimeout("tcp", p.addr, 2*time.Second)
}

func (p *redisPool) put(c net.Conn) {
	p.mu.Lock()
	if len(p.conns) < p.max {
		p.conns = append(p.conns, c)
		p.mu.Unlock()
		return
	}
	p.mu.Unlock()
	_ = c.Close()
}

func writeCmd(w *bufio.Writer, args ...string) error {
	if _, err := fmt.Fprintf(w, "*%d\r\n", len(args)); err != nil {
		return err
	}
	for _, a := range args {
		if _, err := fmt.Fprintf(w, "$%d\r\n%s\r\n", len(a), a); err != nil {
			return err
		}
	}
	return w.Flush()
}

// readReply parses a single RESP reply. Returns nil for a nil bulk string.
func readReply(r *bufio.Reader) (interface{}, error) {
	line, err := r.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if len(line) < 3 {
		return nil, fmt.Errorf("malformed reply")
	}
	typ := line[0]
	body := strings.TrimRight(line[1:], "\r\n")
	switch typ {
	case '+':
		return body, nil
	case '-':
		return nil, fmt.Errorf("redis error: %s", body)
	case ':':
		n, _ := strconv.ParseInt(body, 10, 64)
		return n, nil
	case '$':
		n, err := strconv.Atoi(body)
		if err != nil {
			return nil, err
		}
		if n < 0 {
			return nil, nil
		}
		buf := make([]byte, n+2) // value + trailing CRLF
		if _, err := io.ReadFull(r, buf); err != nil {
			return nil, err
		}
		return string(buf[:n]), nil
	default:
		return nil, fmt.Errorf("unsupported reply type %q", string(typ))
	}
}

func (p *redisPool) do(args ...string) (interface{}, error) {
	c, err := p.get()
	if err != nil {
		return nil, err
	}
	_ = c.SetDeadline(time.Now().Add(2 * time.Second))
	w := bufio.NewWriter(c)
	r := bufio.NewReader(c)

	if err := writeCmd(w, args...); err != nil {
		_ = c.Close()
		return nil, err
	}
	reply, err := readReply(r)
	if err != nil {
		_ = c.Close()
		return nil, err
	}
	_ = c.SetDeadline(time.Time{})
	p.put(c)
	return reply, nil
}
