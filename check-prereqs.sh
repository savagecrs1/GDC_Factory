#!/usr/bin/env bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# check-prereqs.sh
# 1-Click Prerequisite Checker for GDC Edge Operations Portal & Studio

set -u

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================================${NC}"
echo -e "${CYAN}🔍 Google Distributed Cloud (GDC) Edge Operations - Prerequisite Check${NC}"
echo -e "${BLUE}====================================================================${NC}\n"

MISSING_TIER1=0
MISSING_TIER2=0
MISSING_TIER3=0

check_tool() {
  local tool=$1
  local tier=$2
  local name=$3
  if command -v "$tool" >/dev/null 2>&1; then
    local path_val=$(command -v "$tool")
    local ver=""
    case "$tool" in
      node) ver=$(node -v 2>/dev/null || echo "") ;;
      npm) ver="v$(npm -v 2>/dev/null || echo "")" ;;
      terraform) ver=$(terraform -version 2>/dev/null | head -n 1 | awk '{print $2}' || echo "") ;;
      ansible-playbook) ver=$(ansible-playbook --version 2>/dev/null | head -n 1 | awk '{print $2}' || echo "") ;;
      gcloud) ver="v$(gcloud --version 2>/dev/null | head -n 1 | awk '{print $4}' || echo "")" ;;
      kubectl) ver="v$(kubectl version --client -o json 2>/dev/null | grep gitVersion | head -n 1 | cut -d '"' -f 4 || echo "")" ;;
      docker) ver=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',' || echo "") ;;
      *) ver="" ;;
    esac
    echo -e "  [${GREEN}OK${NC}] ${name} (${tool}): ${GREEN}${path_val}${NC} ${ver}"
    return 0
  else
    if [ "$tool" == "docker" ]; then
      echo -e "  [${YELLOW}OPTIONAL${NC}] ${name} (${tool}): ${YELLOW}Not found in PATH (Only needed if running via container)${NC}"
      return 0
    fi
    echo -e "  [${RED}MISSING${NC}] ${name} (${tool}): ${RED}Not found in PATH${NC}"
    if [ "$tier" -eq 1 ]; then MISSING_TIER1=$((MISSING_TIER1 + 1)); fi
    if [ "$tier" -eq 2 ]; then MISSING_TIER2=$((MISSING_TIER2 + 1)); fi
    if [ "$tier" -eq 3 ]; then MISSING_TIER3=$((MISSING_TIER3 + 1)); fi
    return 1
  fi
}

echo -e "${CYAN}--- Tier 1: Emulate-Only Mode (Offline Demo Sandbox) ---${NC}"
echo "Required to run local UI frontend and synthetic simulation streams without cloud access."
check_tool "node" 1 "Node.js Runtime"
check_tool "npm" 1 "Node Package Manager"
check_tool "docker" 1 "Docker Engine (Optional container alternative)"
echo ""

echo -e "${CYAN}--- Tier 2: Argolis Cloud Sandbox Mode (Virtual GDC Cluster Deployment) ---${NC}"
echo "Required to provision virtual bare-metal VMs and GDC clusters in Google Cloud projects."
check_tool "gcloud" 2 "Google Cloud SDK"
check_tool "terraform" 2 "HashiCorp Terraform"
check_tool "ansible-playbook" 2 "Ansible Automation"
check_tool "git" 2 "Git Version Control"

# Check Application Default Credentials (ADC) if gcloud exists
if command -v gcloud >/dev/null 2>&1; then
  if gcloud auth application-default print-access-token >/dev/null 2>&1; then
    echo -e "  [${GREEN}OK${NC}] GCP Application Default Credentials (ADC): ${GREEN}Active${NC}"
  else
    echo -e "  [${YELLOW}WARN${NC}] GCP Application Default Credentials (ADC): ${YELLOW}Not logged in${NC} -> Run: gcloud auth application-default login"
    MISSING_TIER2=$((MISSING_TIER2 + 1))
  fi
fi
echo ""

echo -e "${CYAN}--- Tier 3: Production Bare-Metal Mode (Physical Hardware Operations) ---${NC}"
echo "Required to interface directly with physical edge cluster nodes and K8s API servers."
check_tool "kubectl" 3 "Kubernetes CLI"

if [ -f "$HOME/.ssh/google_compute_engine" ] || [ -f "$HOME/.ssh/id_ed25519" ] || [ -f "$HOME/.ssh/id_rsa" ]; then
  echo -e "  [${GREEN}OK${NC}] SSH Keypair: ${GREEN}Found in ~/.ssh/${NC}"
else
  echo -e "  [${YELLOW}WARN${NC}] SSH Keypair: ${YELLOW}No default SSH key found in ~/.ssh/ (Run: ssh-keygen -t ed25519)${NC}"
  MISSING_TIER3=$((MISSING_TIER3 + 1))
fi
echo ""

echo -e "${BLUE}====================================================================${NC}"
echo -e "${CYAN}📊 Prerequisite Assessment Summary:${NC}"

if [ $MISSING_TIER1 -eq 0 ]; then
  echo -e "  ✅ Tier 1 (Emulate Mode): ${GREEN}READY${NC} - You can run local UI simulations immediately."
else
  echo -e "  ❌ Tier 1 (Emulate Mode): ${RED}INCOMPLETE${NC} - Install Node.js v18+ and npm."
fi

if [ $MISSING_TIER2 -eq 0 ]; then
  echo -e "  ✅ Tier 2 (Argolis Mode): ${GREEN}READY${NC} - You can deploy virtual GDC clusters in GCP."
else
  echo -e "  ⚠️ Tier 2 (Argolis Mode): ${YELLOW}INCOMPLETE${NC} - Missing $MISSING_TIER2 tool(s) or GCP ADC login."
fi

if [ $MISSING_TIER3 -eq 0 ]; then
  echo -e "  ✅ Tier 3 (Production Mode): ${GREEN}READY${NC} - You can manage live bare-metal clusters."
else
  echo -e "  ⚠️ Tier 3 (Production Mode): ${YELLOW}INCOMPLETE${NC} - Missing $MISSING_TIER3 tool(s) or SSH keys."
fi

if [ $MISSING_TIER1 -gt 0 ] || [ $MISSING_TIER2 -gt 0 ] || [ $MISSING_TIER3 -gt 0 ]; then
  echo -e "\n${YELLOW}💡 Quick Installation Guide for Missing CLI Tools:${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "  macOS (via Homebrew):"
    echo -e "    ${CYAN}brew install node terraform ansible google-cloud-sdk kubernetes-cli${NC}"
  elif [[ -f "/etc/debian_version" ]]; then
    echo -e "  Debian / Ubuntu Linux:"
    echo -e "    ${CYAN}sudo apt-get update && sudo apt-get install -y nodejs npm terraform ansible google-cloud-cli kubectl${NC}"
  elif [[ -f "/etc/redhat-release" ]]; then
    echo -e "  RHEL / Rocky / Fedora Linux:"
    echo -e "    ${CYAN}sudo dnf install -y nodejs npm terraform ansible google-cloud-cli kubectl${NC}"
  fi
fi
echo -e "${BLUE}====================================================================${NC}"
