#Requires -Version 5.1
<#
.SYNOPSIS
    Connect kubectl to a Kroger GDCE (GKE Fleet) cluster with minimal prompts.

.DESCRIPTION
    Runs the GDCE cluster context flow using the same commands typically run
    manually:
      kubectl config set-credentials <credentials-name> --username=... --password=...
      kubectl config set-context <cluster> --cluster=<cluster> --user=<credentials-name>
      kubectl config use-context <cluster>
      gcloud config set project <fleet-project>
      gcloud container fleet memberships get-credentials <cluster>
      optional: kubectl get nodes

    Fleet project is resolved automatically from GDCE source_of_truth.csv when possible.
    K8s username/password come from environment variables, an optional local override
    file, or a secure password prompt (never stored in this script).

.PARAMETER ClusterName
    Fleet membership / cluster name (e.g. lo001, ci003, lo001-pci).

.PARAMETER FleetProjectId
    GCP fleet project ID. When omitted, resolved from source_of_truth.csv or heuristics.

.PARAMETER SourceOfTruthPath
    Path to gdce-acm source_of_truth.csv. Defaults to GDCE_SOURCE_OF_TRUTH env var, then
    c:\kroger_isc_projects\gdce-acm\source_of_truth.csv if that file exists.

.PARAMETER K8sUsername
    Kubernetes basic-auth username. Defaults to K8S_USERNAME, then USERNAME env var.

.PARAMETER CredentialsName
    kubectl credentials entry name. Defaults to KUBECTL_CREDENTIALS_NAME or RaajaMD_Isc_GCP_Cloud.

.PARAMETER SkipNodeCheck
    Do not run kubectl get nodes after connecting.

.PARAMETER ListClusters
    Print cluster names from source_of_truth.csv and exit.

.EXAMPLE
    .\Connect-GdceCluster.ps1
    # Prompts for the cluster name, then auto-resolves the fleet project.

.EXAMPLE
    .\Connect-GdceCluster.ps1 ci003

.EXAMPLE
    $env:K8S_PASSWORD = '***'; .\Connect-GdceCluster.ps1 lo001-pci
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ClusterName,

    [string]$FleetProjectId,

    [string]$SourceOfTruthPath,

    [string]$K8sUsername,

    [string]$CredentialsName,

    [switch]$SkipNodeCheck,

    [switch]$ListClusters,

    # Skip set-credentials prompt when kubeconfig already has the credential entry.
    [switch]$ReuseCredentials,

    # Only configure kubectl credentials (no cluster context / gcloud). For batch multi-cluster runs.
    [switch]$ConfigureCredentialsOnly,

    # Fail instead of prompting for fleet project ID or cluster name (batch / automation).
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

$DefaultCredentialsName = 'RaajaMD_Isc_GCP_Cloud'
$DefaultSourceOfTruth = 'c:\kroger_isc_projects\gdce-acm\source_of_truth.csv'
$LocalOverrideFile = Join-Path $PSScriptRoot 'Connect-GdceCluster.local.ps1'

function Test-CliAvailable {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Name"
    }
}

function Resolve-CliCommandPath {
    param(
        [string]$Name,
        [string]$PreferredName
    )

    $commands = @(Get-Command $Name -All -ErrorAction SilentlyContinue)
    if ($PreferredName) {
        $preferred = $commands | Where-Object { $_.Name -ieq $PreferredName } | Select-Object -First 1
        if ($preferred) {
            return $preferred.Source
        }
    }

    $application = $commands | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
    if ($application) {
        return $application.Source
    }

    $fallback = $commands | Select-Object -First 1
    if ($fallback) {
        return $fallback.Source
    }

    throw "Required command not found on PATH: $Name"
}

function Import-LocalOverrides {
    if (Test-Path -LiteralPath $LocalOverrideFile) {
        Write-Verbose "Loading local overrides from $LocalOverrideFile"
        . $LocalOverrideFile
    }
}

function Get-SourceOfTruthPath {
    if ($SourceOfTruthPath -and (Test-Path -LiteralPath $SourceOfTruthPath)) {
        return (Resolve-Path -LiteralPath $SourceOfTruthPath).Path
    }
    $fromEnv = $env:GDCE_SOURCE_OF_TRUTH
    if ($fromEnv -and (Test-Path -LiteralPath $fromEnv)) {
        return (Resolve-Path -LiteralPath $fromEnv).Path
    }
    if (Test-Path -LiteralPath $DefaultSourceOfTruth) {
        return (Resolve-Path -LiteralPath $DefaultSourceOfTruth).Path
    }
    return $null
}

function Get-FleetProjectMap {
    param([string]$CsvPath)

    $map = @{}
    if (-not $CsvPath) { return $map }

    Import-Csv -Path $CsvPath | ForEach-Object {
        $name = ($_.cluster_name -as [string]).Trim()
        $project = ($_.project_id -as [string]).Trim()
        if ($name -and $project) {
            $map[$name] = $project
        }
    }
    return $map
}

function Resolve-FleetProjectId {
    param(
        [string]$Cluster,
        [hashtable]$Map
    )

    if ($Map.ContainsKey($Cluster)) {
        return $Map[$Cluster]
    }

    # Common fallbacks when source_of_truth.csv is unavailable
    switch -Regex ($Cluster) {
        '^lo001(-pci)?$' { return 'kr-9985-edgcmp-024-p' }
        '^ci921(-pci)?$' { return 'kr-9985-edgcmp-014-p' }
        '^ci705(-pci)?$' { return 'kr-9985-edgcmp-014-p' }
        '^ci020(-pci)?$' { return 'kr-9985-edgcmp-t' }
        '^ci021(-pci)?$' { return 'kr-9985-edgcmp-s' }
        '^ci022' { return 'kr-9985-edgcmp-t' }
        '^ci00[139](-pci)?$' { return 'kr-9985-edgcmp-d' }
        '^ci009h$' { return 'kr-9985-edgcmp-d' }
        '^ci003$' { return 'kr-9985-edgcmp-d' }
    }

    return $null
}

function Get-KubeconfigCredentialPair {
    param([string]$CredentialsName)

    if (-not $CredentialsName) {
        return $null
    }

    try {
        $rawConfig = & $script:KubectlCommand config view --raw -o json 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $rawConfig) {
            return $null
        }

        $config = $rawConfig | ConvertFrom-Json
        $matchingUser = $config.users | Where-Object { $_.name -eq $CredentialsName } | Select-Object -First 1
        if (-not $matchingUser -or -not $matchingUser.user) {
            return $null
        }

        $username = $matchingUser.user.username
        $password = $matchingUser.user.password
        if (-not $username -and -not $password) {
            return $null
        }

        return @{
            Username = $username
            Password = $password
        }
    } catch {
        return $null
    }
}

function Should-SetK8sCredentials {
    param([bool]$AlreadyConfigured)

    if ($AlreadyConfigured) {
        $prompt = 'Run kubectl config set-credentials again? [y/N]'
    } else {
        $prompt = 'kubectl credentials not found. Run kubectl config set-credentials now? [Y/n]'
    }

    $answer = (Read-Host $prompt).Trim()
    if (-not $answer) {
        return (-not $AlreadyConfigured)
    }

    return $answer -match '^(y|yes)$'
}

function Ensure-K8sCredentialPair {
    param(
        [string]$UsernameHint,
        [string]$CredentialsName,
        [switch]$ReuseCredentials
    )

    $storedCreds = Get-KubeconfigCredentialPair -CredentialsName $CredentialsName
    $hasStoredCreds = [bool]($storedCreds -and $storedCreds.Username -and $storedCreds.Password)

    if ($ReuseCredentials -and $hasStoredCreds) {
        return @{
            Username          = $storedCreds.Username
            Password          = $storedCreds.Password
            AlreadyConfigured = $true
        }
    }

    $shouldSetCredentials = Should-SetK8sCredentials -AlreadyConfigured:$hasStoredCreds

    if ($hasStoredCreds -and -not $shouldSetCredentials) {
        return @{
            Username          = $storedCreds.Username
            Password          = $storedCreds.Password
            AlreadyConfigured = $true
        }
    }

    if (-not $hasStoredCreds -and -not $shouldSetCredentials) {
        throw "kubectl credentials '$CredentialsName' are not configured. Run set-credentials or answer Yes when prompted."
    }

    $defaultUser = $K8sUsername
    if (-not $defaultUser) { $defaultUser = $env:K8S_USERNAME }
    if (-not $defaultUser -and $storedCreds) { $defaultUser = $storedCreds.Username }
    if (-not $defaultUser) { $defaultUser = $env:USERNAME }
    if (-not $defaultUser -and $UsernameHint) { $defaultUser = $UsernameHint }

    $defaultPass = $env:K8S_PASSWORD
    if (-not $defaultPass) { $defaultPass = $env:PASSWORD }
    if (-not $defaultPass -and $storedCreds) { $defaultPass = $storedCreds.Password }

    if ($defaultUser) {
        $enteredUser = (Read-Host "Kubernetes username (press Enter to keep '$defaultUser')").Trim()
        if ($enteredUser) {
            $user = $enteredUser
        } else {
            $user = $defaultUser
        }
    } else {
        $user = (Read-Host 'Kubernetes username (e.g. Kroger EUID)').Trim()
    }

    if ($defaultPass) {
        $secure = Read-Host 'Kubernetes password (press Enter to keep current password)' -AsSecureString
    } else {
        $secure = Read-Host 'Kubernetes password' -AsSecureString
    }
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
    if (-not $pass) {
        $pass = $defaultPass
    }

    if (-not $user -or -not $pass) {
        throw 'Kubernetes username and password are required. Set K8S_USERNAME/K8S_PASSWORD, use Connect-GdceCluster.local.ps1, or enter when prompted.'
    }

    $credentialCommand = "kubectl config set-credentials $CredentialsName --username=$user --password=$pass"
    $kubectlCredentialArgs = @(
        'config', 'set-credentials', $CredentialsName,
        "--username=$user",
        "--password=$pass"
    )
    Invoke-Kubectl $credentialCommand @kubectlCredentialArgs

    $updatedCreds = Get-KubeconfigCredentialPair -CredentialsName $CredentialsName
    if (-not $updatedCreds -or -not $updatedCreds.Username -or -not $updatedCreds.Password) {
        throw "kubectl credentials '$CredentialsName' could not be saved to kubeconfig."
    }

    return @{
        Username          = $updatedCreds.Username
        Password          = $updatedCreds.Password
        AlreadyConfigured = $false
    }
}

function Invoke-Gcloud {
    param(
        [string]$CommandText,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )
    Write-Host $CommandText
    Write-Verbose $CommandText

    $process = Start-Process `
        -FilePath $script:GcloudCommand `
        -ArgumentList $Args `
        -NoNewWindow `
        -Wait `
        -PassThru

    if ($process.ExitCode -ne 0) {
        throw "Command failed: $CommandText"
    }
}

function Invoke-GcloudCapture {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )

    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process `
            -FilePath $script:GcloudCommand `
            -ArgumentList $Args `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile

        return @{
            ExitCode = $process.ExitCode
            StdOut   = ([System.IO.File]::ReadAllText($stdoutFile).Trim())
            StdErr   = ([System.IO.File]::ReadAllText($stderrFile).Trim())
        }
    } finally {
        Remove-Item -LiteralPath $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-GcloudAuth {
    Write-Host 'gcloud auth print-access-token'
    $tokenResult = Invoke-GcloudCapture 'auth' 'print-access-token'
    if ($tokenResult.ExitCode -eq 0 -and $tokenResult.StdOut) {
        return
    }

    Write-Host 'gcloud auth login'
    $login = Start-Process `
        -FilePath $script:GcloudCommand `
        -ArgumentList @('auth', 'login') `
        -NoNewWindow `
        -Wait `
        -PassThru

    if ($login.ExitCode -ne 0) {
        throw 'Command failed: gcloud auth login'
    }

    $tokenResult = Invoke-GcloudCapture 'auth' 'print-access-token'
    if ($tokenResult.ExitCode -ne 0 -or -not $tokenResult.StdOut) {
        $detail = @($tokenResult.StdOut, $tokenResult.StdErr) | Where-Object { $_ } | Out-String
        throw "No gcloud access token available after login.`n$($detail.Trim())"
    }
}

function Invoke-Kubectl {
    param(
        [string]$CommandText,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Args
    )
    Write-Host $CommandText
    Write-Verbose $CommandText
    $output = & $script:KubectlCommand @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $CommandText`n$(($output | Out-String).Trim())"
    }
}

Import-LocalOverrides
Test-CliAvailable -Name 'gcloud.cmd'
Test-CliAvailable -Name 'kubectl'

$script:GcloudCommand = 'gcloud.cmd'
$script:KubectlCommand = Resolve-CliCommandPath -Name 'kubectl' -PreferredName 'kubectl.exe'

$sotPath = Get-SourceOfTruthPath
$fleetMap = Get-FleetProjectMap -CsvPath $sotPath

if ($ListClusters) {
    if (-not $sotPath) {
        Write-Warning "source_of_truth.csv not found. Set GDCE_SOURCE_OF_TRUTH or -SourceOfTruthPath."
        exit 1
    }
    Write-Host "Clusters in: $sotPath"
    $fleetMap.Keys | Sort-Object | ForEach-Object { Write-Host "  $_ -> $($fleetMap[$_])" }
    exit 0
}

$credName = $CredentialsName
if (-not $credName) { $credName = $env:KUBECTL_CREDENTIALS_NAME }
if (-not $credName) { $credName = $DefaultCredentialsName }

if ($ConfigureCredentialsOnly) {
    $reuse = $ReuseCredentials -or ($env:GDCE_REUSE_CREDENTIALS -match '^(1|true|yes)$')
    $creds = Ensure-K8sCredentialPair -CredentialsName $credName -ReuseCredentials:$reuse
    Write-Host "kubectl credentials ready: $credName (user: $($creds.Username))"
    exit 0
}

$cluster = $ClusterName
if (-not $cluster) {
    if ($NonInteractive) {
        throw 'ClusterName is required when -NonInteractive is set.'
    }
    $cluster = Read-Host 'Cluster name (e.g. lo001, ci003, lo001-pci)'
}
$cluster = $cluster.Trim()
if (-not $cluster) { throw 'ClusterName is required.' }

if (-not $FleetProjectId) {
    $FleetProjectId = Resolve-FleetProjectId -Cluster $cluster -Map $fleetMap
}
if (-not $FleetProjectId) {
    if ($NonInteractive) {
        throw "Fleet GCP project ID for cluster '$cluster' could not be resolved from source_of_truth.csv. Add the cluster to SOT or pass -FleetProjectId."
    }
    $FleetProjectId = Read-Host "Fleet GCP project ID for cluster '$cluster'"
}
$FleetProjectId = $FleetProjectId.Trim()
if (-not $FleetProjectId) { throw 'FleetProjectId could not be resolved.' }

$reuseCreds = $ReuseCredentials -or ($env:GDCE_REUSE_CREDENTIALS -match '^(1|true|yes)$')
$creds = Ensure-K8sCredentialPair -CredentialsName $credName -ReuseCredentials:$reuseCreds

Write-Host "==== GDCE cluster connect ===="
Write-Host "  Cluster       : $cluster"
Write-Host "  Fleet project : $FleetProjectId"
if ($sotPath) { Write-Host "  SOT           : $sotPath" }
Write-Host "  K8s user      : $($creds.Username)"
Write-Host "  Credentials   : $credName"
Write-Host ""
Write-Host '----Cluster Context Changing commands-------------'

if ($creds.AlreadyConfigured) {
    Write-Host "kubectl config set-credentials $credName --username=$($creds.Username) --password=$($creds.Password)  # skipped by user"
}

Invoke-Kubectl "kubectl config set-context $cluster --cluster=$cluster --user=$credName" config set-context $cluster --cluster=$cluster --user=$credName

Invoke-Kubectl "kubectl config use-context $cluster" config use-context $cluster

Ensure-GcloudAuth

Invoke-Gcloud "gcloud config set project $FleetProjectId" config set project $FleetProjectId

Invoke-Gcloud "gcloud container fleet memberships get-credentials $cluster" container fleet memberships get-credentials $cluster

if (-not $SkipNodeCheck) {
    Write-Host 'kubectl get nodes'
    & $script:KubectlCommand get nodes
    if ($LASTEXITCODE -ne 0) {
        throw 'Connected but kubectl get nodes failed. Check VPN/proxy, gcloud auth, and RBAC.'
    }
}

Write-Host ''
$active = (& $script:KubectlCommand config current-context 2>&1 | Out-String).Trim()
Write-Host "Done. Active context: $active"
