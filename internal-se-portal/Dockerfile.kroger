# Dockerfile.kroger
# Self-contained container image for the Kroger GDC Connected Hybrid PCI Edge Portal
FROM node:20-bookworm-slim

# Install system dependencies, Python 3, Ansible prerequisites, and tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    jq \
    unzip \
    git \
    openssh-client \
    ca-certificates \
    gnupg \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK (gcloud)
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts --install-dir=/opt
ENV PATH="/opt/google-cloud-sdk/bin:${PATH}"

# Install Terraform v1.7.5
RUN curl -sSL https://releases.hashicorp.com/terraform/1.7.5/terraform_1.7.5_linux_amd64.zip -o /tmp/terraform.zip && \
    unzip /tmp/terraform.zip -d /usr/local/bin/ && \
    rm /tmp/terraform.zip && \
    chmod +x /usr/local/bin/terraform

# Install Ansible and GCP Python dependencies
RUN pip3 install --break-system-packages ansible google-auth requests kubernetes

# Set working directory
WORKDIR /app

# Copy infrastructure automation code and helper scripts
COPY project-setup.sh /app/project-setup.sh
COPY terraform/ /app/terraform/
COPY ansible/ /app/ansible/

# Make scripts executable
RUN chmod +x /app/project-setup.sh /app/ansible/inventory.sh

# Copy Kroger UI portal
COPY ui-kroger/ /app/ui-kroger/

# Install Node dependencies and build Kroger production UI
WORKDIR /app/ui-kroger
RUN npm install && npm run build

# Expose Kroger portal port
EXPOSE 3001

# Set environment variable for containerized mode
ENV GDC_CONTAINERIZED=true
ENV PORT=3001

# Start the Kroger Next.js production server
CMD ["npm", "start", "--", "-p", "3001"]
