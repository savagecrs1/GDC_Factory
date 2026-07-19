import time
import subprocess
import os


def get_tuna_ip(tuna_server):
    if tuna_server is None:
        return None
    try:
        result = subprocess.run(['dig', '+short', tuna_server], capture_output=True, text=True, check=True)
        ip = result.stdout.strip()
        return ip
    except Exception as e:
        print(f"Error resolving TUNA server IP: {e}")
        return None

TUNA_SERVER=os.environ.get('TUNA_SERVER')
TUNA_SERVER_IP=get_tuna_ip(TUNA_SERVER)
LOG_DIR = os.environ.get('LOG_DIR', '.')


def run_command(command, err=None):
    if err is not None:
        print(f"Running Command: {command}")
    """Runs a command and returns the output."""
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        output = result.stdout if result.stdout else ""
        error = result.stderr if result.stderr else ""
        return output + error, None
    except FileNotFoundError:
        return None, f"The command '{command[0]}' was not found. Please ensure it is installed and in your PATH."


def main():
    """
    Runs dig on api.kroger.com in a loop. If it fails, runs dig, traceroute, and curl on other domains
    and logs the output to a file named with a timestamp and the domain.
    """
    primary_domain = [
            {
            'domain': 'api.kroger.com',
            'dns_servers': [None, '@8.8.8.8', f'@{TUNA_SERVER_IP}', f'@{TUNA_SERVER}']
            }, {
            'domain': 'z.ci921.kroger.com',
            'dns_servers': [None, f'@{TUNA_SERVER_IP}']
            }, {
            'domain': 'z.ci922.kroger.com',
            'dns_servers': [None, f'@{TUNA_SERVER_IP}']
            }
        ]
    fallback_domains = ['google.com', 'portal.azure.com', 'ecsb.kroger.com', 'api.kroger.com']
    dns_servers = [None, '@8.8.8.8', f'@{TUNA_SERVER_IP}', f'@{TUNA_SERVER}']
    protocols = ['+notcp', '+tcp']
    count = 0
    while True:
        primary_check_failed = False
        total_output = ""
        for domain_info in primary_domain:
            domain = domain_info['domain']
            dns_server = domain_info['dns_servers']
            for protocol in protocols:
                for server in dns_server:
                    command = ['dig', domain, protocol]
                    if server is not None:
                        command = ['dig', f"{server}", domain, protocol]
                    output, error = run_command(command)
                    if error is not None:
                        primary_check_failed = True
                        total_output += f"{command} failed.\nError: {error}\n\n"
                    elif "NOERROR" not in output:
                        primary_check_failed = True
                        total_output += f"{command} resulted in failure.\nOutput:\n{output}\n\n"                
                    else:
                        total_output += f"Command {command} output:\n{output}\n\n"

        public_ip, error = run_command(['curl', "-s", "ifconfig.me"])
        count += 1

        if primary_check_failed or count == 50:
            timestamp = int(time.time())
            if count == 50:
                output_file = f"{LOG_DIR}/success_{timestamp}.txt"
                count = 0
            else:
                count = 0
                output_file = f"{LOG_DIR}/error_{timestamp}.txt"
            with open(output_file, 'w') as f:
                f.write(f"Primary DNS check {'failed' if primary_check_failed else 'succeeded'}. With public IP {public_ip.strip()} Running diagnostics.\n")
                f.write(total_output)

                for domain in fallback_domains:
                    # dig
                    for protocol in protocols:
                        for server in dns_servers:
                            command = ['dig', domain, protocol]
                            if server is not None:
                                command = ['dig', f"{server}", domain, protocol]
                            f.write(f"--- dig {server if server is not None else 'default'} {domain} {protocol} ---\n")
                            output, cmd_error = run_command(command, True)
                            if output:
                                f.write(output)
                            if cmd_error:
                                f.write(f"Error: {cmd_error}\n")
                            f.write("\n")

                    # traceroute
                    f.write(f"--- traceroute -T {domain} ---\n")
                    output, cmd_error = run_command(['traceroute', '-T', domain], True)
                    if output:
                        f.write(output)
                    if cmd_error:
                        f.write(f"Error: {cmd_error}\n")
                    f.write("\n")

                    # curl
                    f.write(f"--- curl -v {domain} ---\n")
                    output, cmd_error = run_command(['curl', '-v', '--max-time', '30', domain], True)
                    if output:
                        f.write(output)
                    if cmd_error:
                        f.write(f"Error: {cmd_error}\n")
                    f.write("\n")                        
                    
                # Speed test
                if primary_check_failed:
                    f.write(f"--- speedtest-cli ---\n")
                    output, cmd_error = run_command(['speedtest-cli'], True)
                    if output:
                        f.write(output)
                    if cmd_error:
                        f.write(f"Error: {cmd_error}\n")
                    f.write("\n")
                    
                    f.write(f"--- ping -c 4 8.8.8.8 ---\n")
                    output, cmd_error = run_command(['ping', '-c', '4', '8.8.8.8'], True)
                    if output:
                        f.write(output)
                    if cmd_error:
                        f.write(f"Error: {cmd_error}\n")
                    f.write("\n")
                    
                    f.write(f"--- ping -c 4 1.1.1.1 ---\n")
                    output, cmd_error = run_command(['ping', '-c', '4', '1.1.1.1'], True)
                    if output:
                        f.write(output)
                    if cmd_error:
                        f.write(f"Error: {cmd_error}\n")
                    f.write("\n")

            print(f"Primary DNS check {'failed' if primary_check_failed else 'succeeded'}. Results written to {output_file} with public IP: {public_ip.strip()}")
        else: 
            print(f"Primary DNS check succeeded. Public IP: {public_ip.strip()}")
        # time.sleep(60)


if __name__ == "__main__":
    main()