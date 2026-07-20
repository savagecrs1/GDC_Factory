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

# Target project for cloud checks (command-line arg or active gcloud project)
TARGET_PROJ="${1:-$ACTIVE_PROJ}"

if [ -n "$TARGET_PROJ" ] && [ "$TARGET_PROJ" != "(unset)" ] && [ -n "$ACTIVE_ACCT" ] && [ "$ACTIVE_ACCT" != "(unset)" ]; then
  echo -e "\n${BOLD}4. Checking Cloud Prerequisites on Project (${TARGET_PROJ}):${RESET}"
  
  # A. IAM Roles Verification
  echo -e "  🔍 Inspecting IAM policies for ${ACTIVE_ACCT}..."
  IAM_ROLES=$(gcloud projects get-iam-policy "${TARGET_PROJ}" --flatten="bindings[].members" --format="value(bindings.role)" --filter="bindings.members:${ACTIVE_ACCT}" 2>/dev/null || echo "")
  
  if echo "$IAM_ROLES" | grep -qE "roles/owner|roles/editor"; then
    echo -e "  [${GREEN}✓${RESET}] ${BOLD}IAM Role${RESET}: Owner/Editor privilege detected"
  else
    for role in "roles/resourcemanager.projectIamAdmin" "roles/iam.serviceAccountAdmin" "roles/storage.admin"; do
      if echo "$IAM_ROLES" | grep -q "$role"; then
        echo -e "  [${GREEN}✓${RESET}] ${BOLD}IAM Role${RESET}: Found ${role}"
      else
        echo -e "  [${YELLOW}!${RESET}] ${BOLD}IAM Warning${RESET}: Missing ${role} (Ensure identity has required admin privileges)"
      fi
    done
  fi

  # B. Billing Linkage Verification
  BILLING_STATUS=$(gcloud beta billing projects describe "${TARGET_PROJ}" --format="value(billingEnabled)" 2>/dev/null || echo "unknown")
  if [ "$BILLING_STATUS" = "True" ] || [ "$BILLING_STATUS" = "true" ]; then
    echo -e "  [${GREEN}✓${RESET}] ${BOLD}Billing Linkage${RESET}: Active billing account linked"
  elif [ "$BILLING_STATUS" = "False" ] || [ "$BILLING_STATUS" = "false" ]; then
    echo -e "  [${RED}✗${RESET}] ${BOLD}Billing Error${RESET}: No active billing account linked to project '${TARGET_PROJ}'!"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  [${YELLOW}!${RESET}] ${BOLD}Billing Status${RESET}: Could not verify billing permissions (Check billing admin access)"
  fi

  # C. Key Organization Policy Constraint Verification
  echo -e "  🔍 Auditing key GCP Organization Policy constraints..."
  for constraint in "compute.vmCanIpForward" "compute.requireOsLogin" "compute.trustedImageProjects"; do
    POLICY_VAL=$(gcloud resource-manager org-policies describe "constraints/${constraint}" --project="${TARGET_PROJ}" --format="value(booleanPolicy.enforced)" 2>/dev/null || echo "not_enforced")
    if [ "$POLICY_VAL" = "true" ] || [ "$POLICY_VAL" = "True" ]; then
      echo -e "  [${YELLOW}!${RESET}] ${BOLD}Org Policy Warning${RESET}: '${constraint}' is ENFORCED. May block GDC VM IP forwarding or SSH."
    else
      echo -e "  [${GREEN}✓${RESET}] ${BOLD}Org Policy${RESET}: '${constraint}' compliant / relaxed"
    fi
  done
fi

echo -e "\n${BOLD}======================================================${RESET}"
if [ $ERRORS -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}SUCCESS:${RESET} Your environment & GCP project are fully configured for GDC Virtual Factory!"
  echo -e " To launch the portal:"
  echo -e "   ./launch-kroger.sh"
else
  echo -e " ${RED}${BOLD}ATTENTION:${RESET} Found ${ERRORS} issue(s). Please resolve the items above before starting."
fi
echo -e "${BOLD}======================================================${RESET}\n"
