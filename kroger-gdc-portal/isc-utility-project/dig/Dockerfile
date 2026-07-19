FROM python:3.14-slim

WORKDIR /app

RUN apt-get update --fix-missing && \
    apt-get install -y dnsutils net-tools traceroute curl speedtest-cli iputils-ping

COPY dig.py /app/dig.py
COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt
RUN mkdir -p /logs
CMD ["python", "-u", "/app/dig.py"]
