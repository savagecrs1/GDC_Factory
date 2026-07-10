#!/usr/bin/env python3
import sys
import json
import smtplib
import subprocess
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def main():
    try:
        # Read payload from stdin
        payload = json.loads(sys.stdin.read())
        recipient = payload.get("to")
        subject = payload.get("subject")
        body = payload.get("body")

        if not recipient or not subject or not body:
            print(json.dumps({"success": False, "error": "Missing payload fields (to, subject, body)"}))
            sys.exit(1)

        # Check for custom SMTP config
        config_path = "/tmp/gdc_smtp_config.json"
        smtp_config = None
        try:
            with open(config_path, "r") as f:
                smtp_config = json.load(f)
        except Exception:
            pass # No config, will fallback to sendmail

        if smtp_config and smtp_config.get("host"):
            # Use custom SMTP server
            host = smtp_config.get("host")
            port = int(smtp_config.get("port", 587))
            user = smtp_config.get("user", "")
            password = smtp_config.get("pass", "")
            from_addr = smtp_config.get("from", "gdc-sentinel-alerts@altostrat.com")

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = recipient

            # Handle both plain text and HTML bodies
            if "<html>" in body.lower():
                msg.attach(MIMEText(body, "html"))
            else:
                msg.attach(MIMEText(body, "plain"))

            # Connect to SMTP server
            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=10)
            else:
                server = smtplib.SMTP(host, port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()

            if user and password:
                server.login(user, password)

            server.sendmail(from_addr, recipient, msg.as_string())
            server.quit()
            print(json.dumps({"success": True, "method": f"SMTP ({host}:{port})"}))

        else:
            # Fallback to local sendmail command
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = "gdc-sentinel-alerts@altostrat.com"
            msg["To"] = recipient

            if "<html>" in body.lower():
                msg.attach(MIMEText(body, "html"))
            else:
                msg.attach(MIMEText(body, "plain"))

            # Spawn sendmail
            proc = subprocess.Popen(
                ["sendmail", "-t", "-oi"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = proc.communicate(input=msg.as_string())
            if proc.returncode == 0:
                print(json.dumps({"success": True, "method": "local sendmail"}))
            else:
                raise Exception(f"sendmail exited with code {proc.returncode}: {stderr}")

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
