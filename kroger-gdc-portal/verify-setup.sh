#!/usr/bin/env bash
# ==============================================================================
# GDC Virtual Factory - Environment Setup & Pre-flight Verification
# Checks host dependencies, gcloud authentication, Terraform, Ansible, Node.js
# ==============================================================================

set -eo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BOLD}======================================================${RESET}"
echo -e "${BOLD} 🚀 GDC Virtual Factory Environment Verification Check ${RESET}"
echo -e "${BOLD}======================================================${RESET}\n"

ERRORS=0

check_tool() {
  local tool=$1
  local name=$2
  if command -v "$tool" >/dev/null 2>&1; then
    local path
    path=$(command -v "$tool")
    echo -e "  [${GREEN}✓${RESET}] ${BOLD}${name}${RESET}: Found at ${path}"
  else
    echo -e "  [${RED}✗${RESET}] ${BOLD}${name}${RESET}: NOT FOUND! Please install ${tool}."
    ERRORS=$((ERRORS + 1))
  fi
}

echo -e "${BOLD}1. Checking Host CLI Dependencies:${RESET}"
check_tool "gcloud" "Google Cloud SDK CLI"
check_tool "terraform" "HashiCorp Terraform CLI"
check_tool "ansible" "Ansible Engine"
check_tool "ansible-playbook" "Ansible Playbook Runner"
check_tool "node" "Node.js Runtime"
check_tool "npm" "Node Package Manager"

echo -e "\n${BOLD}2. Checking GKE Auth Plugin:${RESET}"
if gcloud components list 2>/dev/null | grep -q "gke-gcloud-auth-plugin"; then
  echo -e "  [${GREEN}✓${RESET}] ${BOLD}gke-gcloud-auth-plugin${RESET}: Installed"
elif command -v kubectl-gke_gcloud_auth_plugin >/dev/null 2>&1; then
  echo -e "  [${GREEN}✓${RESET}] ${BOLD}gke-gcloud-auth-plugin${RESET}: Found in PATH"
else
  echo -e "  [${YELLOW}!${RESET}] ${BOLD}gke-gcloud-auth-plugin${RESET}: Missing! Run 'gcloud components install gke-gcloud-auth-plugin'."
fi

echo -e "\n${BOLD}3. Checking Active GCP Authentication:${RESET}"
ACTIVE_ACCT=$(gcloud config get-value account 2>/dev/null || echo "")
if [ -n "$ACTIVE_ACCT" ] && [ "$ACTIVE_ACCT" != "(unset)" ]; then
  echo -e "  [${GREEN}✓${RESET}] ${BOLD}Active Account${RESET}: ${ACTIVE_ACCT}"
else
  echo -e "  [${RED}✗${RESET}] ${BOLD}No active gcloud account!${RESET} Run 'gcloud auth login' & 'gcloud auth application-default login'."
  ERRORS=$((ERRORS + 1))
fi

ACTIVE_PROJ=$(gcloud config get-value project 2>/dev/null || echo "")
if [ -n "$ACTIVE_PROJ" ] && [ "$ACTIVE_PROJ" != "(unset)" ]; then
  echo -e "  [${GREEN}✓${RESET}] ${BOLD}Active Project${RESET}: ${ACTIVE_PROJ}"
else
  echo -e "  [${YELLOW}!${RESET}] ${BOLD}No active gcloud project set.${RESET} Run 'gcloud config set project <your-project-id>'."
fi

echo -e "\n${BOLD}======================================================${RESET}"
if [ $ERRORS -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}SUCCESS:${RESET} Your environment is fully configured for GDC Virtual Factory!"
  echo -e " To start the portals:"
  echo -e "   cd ui-kroger && npm install && npm run dev -- -p 3001"
  echo -e "   cd ui && npm install && npm run dev -- -p 3002"
else
  echo -e " ${RED}${BOLD}ATTENTION:${RESET} Found ${ERRORS} missing requirement(s). Please resolve the errors above."
fi
echo -e "${BOLD}======================================================${RESET}\n"
