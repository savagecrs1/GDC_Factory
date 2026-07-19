#Requires -Version 5.1
<#
.SYNOPSIS
    Compare CertQuery spreadsheet dates against cert-manager Certificate status in GDCE clusters.

.DESCRIPTION
    Reads a CertQuery export (CSV or XLSX), derives the GDCE cluster name from the Issued CN host
    and the row's Cluster Type column (dual or hybrid):

    Dual (default when Cluster Type is empty or missing):
      ecs.fl346.kroger.com     -> fl346
      ecspci.fl346.kroger.com  -> fl346-pci  (1st label contains "pci")
      All -Namespace values are searched on the cluster.

    Hybrid:
      2nd label of Issued CN is the cluster name (no -pci suffix), e.g. ecspci.ci009h.kroger.com -> ci009h
      1st label contains "pci"  -> search only -Namespace values that contain "pci"
      1st label contains "fuel" -> search only -Namespace values that contain "fuel"
      otherwise               -> search -Namespace values that contain neither "pci" nor "fuel"

    For each unique cluster, connects via Connect-GdceCluster.ps1 (one-time kubectl credentials,
    then per-cluster gcloud fleet get-credentials), verifies each requested namespace exists,
    and runs kubectl get certificates.cert-manager.io -n <namespace> -o json per namespace.
    and compares:
      Effective Date  -> status.notBefore
      Expiration Date -> status.notAfter

    Match rule: both dates must match the cluster timestamp exactly (UTC, to the second).
    Writes Yes / No / Unknown into the Script Validation column (Unknown = connect/kubectl/gcloud or other
    infrastructure failure; could not complete the date comparison). The original Valid column is left unchanged.

    Prerequisites:
      - kubectl and gcloud on PATH
      - Connect-GdceCluster.ps1 in the same folder (uses gdce-acm source_of_truth.csv)
      - K8S_USERNAME / K8S_PASSWORD set, or answer the one-time credential prompt

.PARAMETER InputPath
    Path to CertQuery CSV or XLSX (e.g. CertQuery-2026-06-10T14-14_03-074.csv).

.PARAMETER HostColumn
    Column containing hostnames like ecspci.ci003.kroger.com. Auto-detected when omitted
    (prefers Issued CN, Common Name, Hostname, etc.).

.PARAMETER EffectiveDateColumn
    Input column for certificate effective date. Default: Effective Date

.PARAMETER ExpirationDateColumn
    Input column for certificate expiration date. Default: Expiration Date

.PARAMETER CertNameColumn
    Optional column with Certificate metadata.name in the cluster. When omitted, matches
    spec.dnsNames / spec.commonName against Issued CN (ecs/ecsx/ecspci aliases) or
    spec.secretName kong-default-tls.

.PARAMETER DefaultCertName
    Certificate secret / fallback name when CertNameColumn is not set. Default: kong-default-tls

.PARAMETER Namespace
    Comma-separated namespace(s) to search for cert-manager Certificate resources.
    Each namespace is checked on the cluster before comparison; missing namespaces are
    reported and skipped. For hybrid rows, only namespaces matching pci/fuel/non-pci rules
    are searched. Default: kong-system

.PARAMETER ClusterTypeColumn
    Input column with cluster type per row: dual or hybrid. When empty or missing, dual
    is assumed. Default: Cluster Type

.PARAMETER ScriptValidationColumn
    Output column updated with Yes, No, or Unknown (infrastructure/connect failure). Default: Script Validation

.PARAMETER OutputPath
    Output CSV path. Default: <InputBase>-validated.csv next to the input file.

.PARAMETER SkipConnect
    Skip Connect-GdceCluster.ps1 (use current kubectl context; ClusterName column still populated).

.EXAMPLE
    cd c:\kroger_isc_projects\isc-utility-project\certs_validity_checker

    .\Compare-CertQueryValidity.ps1 -InputPath .\CertQuery-2026-06-10T14-14_03-074.csv

    Standard run: auto-detect Issued CN column, connect to each cluster, write
    CertQuery-2026-06-10T14-14_03-074-validated.csv with Script Validation / ClusterName / ValidationNotes.

.EXAMPLE
    $env:K8S_USERNAME = 'DLT2461'
    $env:K8S_PASSWORD = '***'
    .\Compare-CertQueryValidity.ps1 -InputPath .\CertQuery-export.xlsx

    Avoid credential prompts by setting K8S_USERNAME and K8S_PASSWORD before the run.
    XLSX files are detected automatically (even when the extension is .csv but content is ZIP/XLSX).

.EXAMPLE
    .\Compare-CertQueryValidity.ps1 `
        -InputPath .\CertQuery-export.csv `
        -OutputPath .\reports\cert-check-$(Get-Date -Format yyyy-MM-dd).csv

    Write results to a custom output path.

.EXAMPLE
    .\Compare-CertQueryValidity.ps1 -InputPath .\query.csv -HostColumn "Common Name"

    Use a non-default hostname column when the export does not have Issued CN.

.EXAMPLE
    .\Connect-GdceCluster.ps1 ci003 -ReuseCredentials -SkipNodeCheck
    .\Compare-CertQueryValidity.ps1 -InputPath .\query.csv -SkipConnect

    SkipConnect: validate against the current kubectl context without reconnecting per cluster.
    Useful when testing a single cluster or re-running after manual connect.

.EXAMPLE
    .\Compare-CertQueryValidity.ps1 `
        -InputPath .\query.csv `
        -Namespace 'kong-system,ingress-nginx' `
        -DefaultCertName kong-default-tls `
        -SkipConnect

    Override namespace or default cert secret name (optional; defaults shown above).

.EXAMPLE
    .\Compare-CertQueryValidity.ps1 `
        -InputPath .\query.csv `
        -Namespace 'kong-system,kong-pci,kong-fuel,kong-non-pci' `
        -ClusterTypeColumn 'Cluster Type'

    Hybrid rows use 2nd Issued CN label as cluster name and search pci/fuel/non-pci
    namespaces from -Namespace. Dual rows keep ecs/ecspci cluster routing.

.NOTES
    Output summary lists compared fields, Yes/No counts, clusters checked, and failed rows.
    Review ValidationNotes in the output CSV for date mismatches or connect errors.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [string]$HostColumn,

    [string]$EffectiveDateColumn = 'Effective Date',

    [string]$ExpirationDateColumn = 'Expiration Date',

    [string]$CertNameColumn,

    [string]$DefaultCertName = 'kong-default-tls',

    [string]$Namespace = 'kong-system',

    [string]$ClusterTypeColumn = 'Cluster Type',

    [string]$ScriptValidationColumn = 'Script Validation',

    [string]$OutputPath,

    [switch]$SkipConnect
)

$ErrorActionPreference = 'Stop'

$NamespaceList = @(
    ($Namespace -split ',') |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
)
if ($NamespaceList.Count -eq 0) {
    throw 'At least one namespace is required. Pass -Namespace (comma-separated) or use the default kong-system.'
}
$NamespaceDisplay = $NamespaceList -join ', '

$ConnectScript = Join-Path $PSScriptRoot 'Connect-GdceCluster.ps1'
$ClusterColumn = 'ClusterName'
$NotesColumn = 'ValidationNotes'
$DefaultSourceOfTruth = 'c:\kroger_isc_projects\gdce-acm\source_of_truth.csv'

function Get-GdceSourceOfTruthPath {
    $fromEnv = $env:GDCE_SOURCE_OF_TRUTH
    if ($fromEnv -and (Test-Path -LiteralPath $fromEnv)) {
        return (Resolve-Path -LiteralPath $fromEnv).Path
    }
    if (Test-Path -LiteralPath $DefaultSourceOfTruth) {
        return (Resolve-Path -LiteralPath $DefaultSourceOfTruth).Path
    }
    return $null
}

function Get-GdceFleetProjectMap {
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

function Resolve-GdceFleetProjectId {
    param(
        [string]$Cluster,
        [hashtable]$Map
    )

    if ($Map.ContainsKey($Cluster)) {
        return $Map[$Cluster]
    }

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

function Resolve-InputPath {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Input file not found: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Test-IsXlsxPackage {
    param([string]$Path)

    $fs = [System.IO.File]::OpenRead($Path)
    try {
        $buf = New-Object byte[] 2
        $read = $fs.Read($buf, 0, 2)
        return ($read -eq 2 -and $buf[0] -eq 0x50 -and $buf[1] -eq 0x4B) # PK (ZIP / XLSX)
    } finally {
        $fs.Dispose()
    }
}

function ConvertFrom-ExcelColumnName {
    param([string]$ColumnLetters)

    $sum = 0
    foreach ($ch in $ColumnLetters.ToUpperInvariant().ToCharArray()) {
        if ($ch -lt 'A' -or $ch -gt 'Z') { continue }
        $sum = ($sum * 26) + ([int][char]$ch - [int][char]'A' + 1)
    }
    return ($sum - 1)
}

function Read-XlsxFirstSheetRows {
    param([string]$Path)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    $nsm = New-Object System.Xml.XmlNamespaceManager((New-Object System.Xml.NameTable))
    $nsm.AddNamespace('m', $ns)

    $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $shared = New-Object System.Collections.Generic.List[string]
        $ssEntry = $zip.GetEntry('xl/sharedStrings.xml')
        if ($ssEntry) {
            $sr = New-Object System.IO.StreamReader($ssEntry.Open())
            try {
                $ssXml = [xml]$sr.ReadToEnd()
            } finally {
                $sr.Dispose()
            }
            foreach ($si in $ssXml.SelectNodes('//m:si', $nsm)) {
                $parts = $si.SelectNodes('.//m:t', $nsm) | ForEach-Object { $_.InnerText }
                [void]$shared.Add(($parts -join ''))
            }
        }

        $sheetEntry = $zip.Entries |
            Where-Object { $_.FullName -match '^xl/worksheets/sheet1\.xml$' } |
            Select-Object -First 1
        if (-not $sheetEntry) {
            throw "XLSX workbook has no xl/worksheets/sheet1.xml"
        }

        $sheetReader = New-Object System.IO.StreamReader($sheetEntry.Open())
        try {
            $sheetXml = [xml]$sheetReader.ReadToEnd()
        } finally {
            $sheetReader.Dispose()
        }

        $grid = @{}
        $maxRow = 0
        $maxCol = 0

        foreach ($rowNode in $sheetXml.SelectNodes('//m:sheetData/m:row', $nsm)) {
            $rowIndex = [int]$rowNode.GetAttribute('r') - 1
            if ($rowIndex -lt 0) { continue }
            if ($rowIndex -gt $maxRow) { $maxRow = $rowIndex }

            foreach ($cell in $rowNode.SelectNodes('m:c', $nsm)) {
                $ref = $cell.GetAttribute('r')
                if (-not $ref) { continue }
                if ($ref -notmatch '^([A-Z]+)(\d+)$') { continue }
                $colIndex = ConvertFrom-ExcelColumnName -ColumnLetters $Matches[1]
                if ($colIndex -gt $maxCol) { $maxCol = $colIndex }

                $valueNode = $cell.SelectSingleNode('m:v', $nsm)
                if (-not $valueNode) { continue }
                $raw = $valueNode.InnerText
                if ($cell.GetAttribute('t') -eq 's') {
                    $raw = $shared[[int]$raw]
                }
                if (-not $grid.ContainsKey($rowIndex)) {
                    $grid[$rowIndex] = @{}
                }
                $grid[$rowIndex][$colIndex] = $raw
            }
        }

        if ($maxRow -lt 1) {
            return @()
        }

        $headers = @{}
        for ($c = 0; $c -le $maxCol; $c++) {
            $name = $grid[0][$c]
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            $headers[$c] = ($name -as [string]).Trim()
        }

        $rows = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le $maxRow; $r++) {
            if (-not $grid.ContainsKey($r)) { continue }
            $obj = [ordered]@{}
            $hasData = $false
            foreach ($c in $headers.Keys) {
                $header = $headers[$c]
                $val = $grid[$r][$c]
                if ($null -eq $val) { $val = '' }
                else { $hasData = $true }
                $obj[$header] = $val
            }
            if ($hasData) {
                [void]$rows.Add([pscustomobject]$obj)
            }
        }
        return @($rows.ToArray())
    } finally {
        $zip.Dispose()
    }
}

function Import-SpreadsheetRows {
    param([string]$Path)

    if (Test-IsXlsxPackage -Path $Path) {
        Write-Host 'Detected Excel workbook (ZIP/XLSX) — reading sheet1 natively.'
        return @(Read-XlsxFirstSheetRows -Path $Path)
    }

    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($ext -eq '.xlsx' -or $ext -eq '.xls') {
        $importExcel = Get-Module -ListAvailable -Name ImportExcel | Select-Object -First 1
        if ($importExcel) {
            Import-Module ImportExcel -ErrorAction Stop
            return @(Import-Excel -Path $Path -WorksheetName 1 -DataOnly)
        }
        return @(Read-XlsxFirstSheetRows -Path $Path)
    }

    return @(Import-Csv -LiteralPath $Path)
}

function Get-ClusterNameFromHost {
    param([string]$HostValue)

    $hostValue = ($HostValue -as [string]).Trim()
    if (-not $hostValue) { return $null }

    $parts = $hostValue.Split('.')
    if ($parts.Count -lt 2) { return $null }

    # Dual: ecs.fl346.kroger.com -> fl346; ecspci.fl346.kroger.com -> fl346-pci
    $cluster = $parts[1].Trim()
    if (-not $cluster) { return $null }

    $firstLabel = $parts[0].Trim()

    # Dual hybrid fleet names (e.g. ci009h) use a single membership; no -pci suffix.
    if ($cluster -match 'h$') {
        return $cluster
    }

    if ($firstLabel -match 'pci') {
        return "$cluster-pci"
    }

    return $cluster
}

function Get-HybridClusterNameFromHost {
    param([string]$HostValue)

    $hostValue = ($HostValue -as [string]).Trim()
    if (-not $hostValue) { return $null }

    $parts = $hostValue.Split('.')
    if ($parts.Count -lt 2) { return $null }

    $cluster = $parts[1].Trim()
    if ($cluster) { return $cluster }
    return $null
}

function Get-ClusterTypeForRow {
    param(
        [object]$Row,
        [string]$ColumnName
    )

    if (-not $ColumnName) { return 'dual' }
    $val = (Get-RowValue -Row $Row -ColumnName $ColumnName).Trim()
    if (-not $val) { return 'dual' }
    if ($val -ieq 'hybrid') { return 'hybrid' }
    return 'dual'
}

function Get-ClusterNameForRow {
    param(
        [string]$HostValue,
        [string]$ClusterType
    )

    if ($ClusterType -ieq 'hybrid') {
        return Get-HybridClusterNameFromHost -HostValue $HostValue
    }
    return Get-ClusterNameFromHost -HostValue $HostValue
}

function Get-HybridNamespacesForHost {
    param(
        [string]$HostValue,
        [string[]]$AllNamespaces
    )

    $hostValue = ($HostValue -as [string]).Trim()
    if (-not $hostValue -or $AllNamespaces.Count -eq 0) {
        return @()
    }

    $parts = $hostValue.Split('.')
    $firstLabel = if ($parts.Count -gt 0) { $parts[0].Trim() } else { '' }

    if ($firstLabel -match 'pci') {
        return @($AllNamespaces | Where-Object { $_ -match 'pci' })
    }
    if ($firstLabel -match 'fuel') {
        return @($AllNamespaces | Where-Object { $_ -match 'fuel' })
    }

    return @($AllNamespaces | Where-Object { $_ -notmatch 'pci' -and $_ -notmatch 'fuel' })
}

function Get-RowSearchNamespaces {
    param(
        [string]$HostValue,
        [string]$ClusterType,
        [string[]]$AllNamespaces
    )

    if ($ClusterType -ieq 'hybrid') {
        return @(Get-HybridNamespacesForHost -HostValue $HostValue -AllNamespaces $AllNamespaces)
    }
    return @($AllNamespaces)
}

function Resolve-InputColumnName {
    param(
        [object[]]$Rows,
        [string]$PreferredName
    )

    if (-not $PreferredName -or $Rows.Count -eq 0) { return $null }
    $props = $Rows[0].PSObject.Properties.Name
    return @($props | Where-Object { ($_ -as [string]).Trim() -ieq $PreferredName.Trim() } | Select-Object -First 1)[0]
}

function Test-LooksLikeClusterHost {
    param([string]$Value)

    $value = ($Value -as [string]).Trim()
    if (-not $value) { return $false }
    # ecs.ci003.kroger.com, ecspci.ci003.kroger.com, etc.
    return ($value -match '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.kroger\.com$')
}

function Find-HostColumnName {
    param(
        [object[]]$Rows,
        [string[]]$PreferredNames
    )

    if ($Rows.Count -eq 0) { return $null }
    $props = $Rows[0].PSObject.Properties.Name

    foreach ($name in $PreferredNames) {
        $match = $props | Where-Object { ($_ -as [string]).Trim() -ieq $name } | Select-Object -First 1
        if ($match) {
            $sample = $Rows | ForEach-Object { Get-RowValue -Row $_ -ColumnName $match } |
                Where-Object { Test-LooksLikeClusterHost $_ } | Select-Object -First 1
            if ($sample) { return $match }
        }
    }

    foreach ($prop in $props) {
        $hits = 0
        foreach ($row in $Rows) {
            $val = Get-RowValue -Row $row -ColumnName $prop
            if (Test-LooksLikeClusterHost $val) { $hits++ }
        }
        if ($hits -ge 1) { return $prop }
    }
    return $null
}

function Get-RowPropertyName {
    param(
        [object]$Row,
        [string]$ColumnName
    )
    if (-not $ColumnName -or -not $Row) { return $null }
    $target = $ColumnName.Trim()
    foreach ($prop in $Row.PSObject.Properties) {
        if (($prop.Name -as [string]).Trim() -ieq $target) {
            return $prop.Name
        }
    }
    return $null
}

function Get-RowValue {
    param(
        [object]$Row,
        [string]$ColumnName
    )
    if (-not $ColumnName) { return $null }
    $resolved = Get-RowPropertyName -Row $Row -ColumnName $ColumnName
    if (-not $resolved) { return $null }
    return ($Row.$resolved -as [string]).Trim()
}

function Set-RowColumnValue {
    param(
        [object]$Row,
        [string]$ColumnName,
        [string]$Value
    )
    $resolved = Get-RowPropertyName -Row $Row -ColumnName $ColumnName
    if ($resolved) {
        $Row.$resolved = $Value
    } else {
        $Row | Add-Member -NotePropertyName $ColumnName -NotePropertyValue $Value -Force
    }
}

function Set-RowValidResult {
    param(
        [object]$Row,
        [string]$ScriptValidationColumnName,
        [bool]$EffectiveMatches,
        [bool]$ExpirationMatches,
        [string]$Note = ''
    )

    if ($Note -and (Test-IsInfrastructureFailure -Message $Note)) {
        Set-RowUnknownResult -Row $Row -ScriptValidationColumnName $ScriptValidationColumnName -Note $Note
        return
    }

    $valid = if ($EffectiveMatches -and $ExpirationMatches) { 'Yes' } else { 'No' }
    Set-RowColumnValue -Row $Row -ColumnName $ScriptValidationColumnName -Value $valid
    if ($Note) {
        Set-RowNote -Row $Row -Text $Note
    }
}

function Set-RowUnknownResult {
    param(
        [object]$Row,
        [string]$ScriptValidationColumnName,
        [string]$Note
    )

    Set-RowColumnValue -Row $Row -ColumnName $ScriptValidationColumnName -Value 'Unknown'
    if ($Note) {
        Set-RowNote -Row $Row -Text $Note
    }
}

function Test-IsInfrastructureFailure {
    param([string]$Message)

    if ([string]::IsNullOrWhiteSpace($Message)) { return $false }

    $text = $Message.ToLowerInvariant()
    $patterns = @(
        'cluster api unreachable',
        'command failed',
        'error:',
        'kubectl failed',
        'kubectl not found',
        'kubectl did not return json',
        'connect script not found',
        'connect-gdcecluster',
        'doesn''t have a resource type',
        'get-credentials',
        'couldn''t get current server api group list',
        'server could not find the requested resource',
        'unable to connect',
        'connection refused',
        'connection reset',
        'no such host',
        'context deadline exceeded',
        'i/o timeout',
        'tls handshake timeout',
        'the underlying connection was closed',
        'connectex',
        'error from server \(service unavailable\)',
        'gateway timeout',
        'bad gateway',
        'dial tcp',
        'failed to get api group',
        'the connection to the server .+ was refused',
        'no route to host',
        'network is unreachable',
        'unauthorized',
        'forbidden',
        'permission denied',
        'not authorized',
        'failed to authenticate',
        'credentials',
        'timed out',
        'timeout',
        'exit code'
    )

    foreach ($pattern in $patterns) {
        if ($text -match $pattern) { return $true }
    }
    return $false
}

function Get-HostLookupCandidates {
    param([string]$HostValue)

    $hostValue = ($HostValue -as [string]).Trim()
    if (-not $hostValue) { return @() }

    $seen = @{}
    $add = {
        param([string]$Name)
        if ($Name) { $seen[$Name.ToLowerInvariant()] = $Name }
    }

    & $add $hostValue

    $parts = $hostValue.Split('.')
    if ($parts.Count -ge 3) {
        $prefix = $parts[0]
        $cluster = $parts[1]
        $suffix = ($parts[2..($parts.Count - 1)] -join '.')
        if ($prefix -match '^ecs') {
            foreach ($altPrefix in @('ecs', 'ecsx', 'ecspci')) {
                & $add "$altPrefix.$cluster.$suffix"
            }
        }
    }

    return @($seen.Values)
}

function Test-CertificateMatchesHost {
    param(
        [object]$Certificate,
        [string[]]$HostCandidates
    )

    if (-not $HostCandidates -or $HostCandidates.Count -eq 0) { return $false }

    $dns = @($Certificate.spec.dnsNames)
    $commonName = ($Certificate.spec.commonName -as [string]).Trim()
    foreach ($candidate in $HostCandidates) {
        if ($dns -contains $candidate) { return $true }
        if ($commonName -and ($commonName -ieq $candidate)) { return $true }
    }
    return $false
}

function ConvertTo-NormalizedUtc {
    param([object]$Value)

    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) {
        if ($Value.Kind -eq [DateTimeKind]::Unspecified) {
            return [datetime]::SpecifyKind($Value, [DateTimeKind]::Utc)
        }
        return $Value.ToUniversalTime()
    }

    $text = ($Value -as [string]).Trim()
    if (-not $text) { return $null }

    $styles = @(
        'yyyy-MM-ddTHH:mm:ss.fffffff',
        'yyyy-MM-ddTHH:mm:ss.ffffff',
        'yyyy-MM-ddTHH:mm:ss.fffff',
        'yyyy-MM-ddTHH:mm:ss.ffff',
        'yyyy-MM-ddTHH:mm:ss.fff',
        'yyyy-MM-ddTHH:mm:ssZ',
        'yyyy-MM-ddTHH:mm:ss.fffZ',
        'yyyy-MM-dd HH:mm:ss',
        'yyyy-MM-dd',
        'M/d/yyyy h:mm:ss tt',
        'M/d/yyyy',
        'MM/dd/yyyy h:mm:ss tt',
        'MM/dd/yyyy',
        'dd/MM/yyyy',
        'dd-MMM-yyyy'
    )

    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $stylesEnum = [System.Globalization.DateTimeStyles]::AssumeUniversal
    $parsed = [datetime]::MinValue
    foreach ($style in $styles) {
        if ([datetime]::TryParseExact($text, $style, $culture, $stylesEnum, [ref]$parsed)) {
            return $parsed.ToUniversalTime()
        }
    }
    if ([datetime]::TryParse($text, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsed)) {
        return $parsed.ToUniversalTime()
    }
    return $null
}

function Test-DateMatch {
    param(
        [object]$Expected,
        [object]$Actual
    )

    $exp = ConvertTo-NormalizedUtc -Value $Expected
    $act = ConvertTo-NormalizedUtc -Value $Actual
    if (-not $exp -or -not $act) { return $false }

    # Exact UTC timestamp (cert-manager RFC3339 is second precision).
    $expSec = [datetime]::new($exp.Year, $exp.Month, $exp.Day, $exp.Hour, $exp.Minute, $exp.Second, [DateTimeKind]::Utc)
    $actSec = [datetime]::new($act.Year, $act.Month, $act.Day, $act.Hour, $act.Minute, $act.Second, [DateTimeKind]::Utc)
    return ($expSec -eq $actSec)
}

function Resolve-KubectlCommandPath {
    $commands = @(Get-Command kubectl -All -ErrorAction SilentlyContinue)
    $preferred = $commands | Where-Object { $_.Name -ieq 'kubectl.exe' } | Select-Object -First 1
    if ($preferred) { return $preferred.Source }

    $application = $commands | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
    if ($application) { return $application.Source }

    throw 'kubectl not found on PATH. Install kubectl and ensure the GDCE cluster context is active.'
}

function Invoke-KubectlJson {
    param([string[]]$KubectlArgs)

    if (-not $script:KubectlCommand) {
        $script:KubectlCommand = Resolve-KubectlCommandPath
    }

    $raw = & $script:KubectlCommand @KubectlArgs 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
        throw "kubectl failed: kubectl $($KubectlArgs -join ' ')`n$($raw -join [Environment]::NewLine)"
    }
    $text = ($raw -join [Environment]::NewLine).Trim()
    if (-not $text.StartsWith('{') -and -not $text.StartsWith('[')) {
        $preview = if ($text.Length -gt 400) { $text.Substring(0, 400) + '...' } else { $text }
        throw "kubectl did not return JSON. Output: $preview"
    }
    return $text
}

function Test-KubectlNamespaceExists {
    param([string]$Ns)

    if (-not $script:KubectlCommand) {
        $script:KubectlCommand = Resolve-KubectlCommandPath
    }

    $null = & $script:KubectlCommand get namespace $Ns -o name 2>&1 | ForEach-Object { "$_" }
    return ($LASTEXITCODE -eq 0)
}

function Resolve-ClusterNamespaces {
    param([string[]]$RequestedNamespaces)

    $available = [System.Collections.Generic.List[string]]::new()
    $missing = [System.Collections.Generic.List[string]]::new()

    foreach ($ns in $RequestedNamespaces) {
        if (Test-KubectlNamespaceExists -Ns $ns) {
            [void]$available.Add($ns)
        } else {
            [void]$missing.Add($ns)
        }
    }

    return [pscustomobject]@{
        Available = @($available)
        Missing   = @($missing)
    }
}

function Get-ClusterCertificates {
    param([string]$Ns)

    $resourceTypes = @(
        'certificates.cert-manager.io',
        'certificate.cert-manager.io',
        'cert'
    )
    $json = $null
    $lastError = $null
    foreach ($resourceType in $resourceTypes) {
        try {
            $json = Invoke-KubectlJson -KubectlArgs @('get', $resourceType, '-n', $Ns, '-o', 'json')
            break
        } catch {
            $lastError = $_
        }
    }
    if (-not $json) {
        throw $lastError
    }
    $doc = $json | ConvertFrom-Json
    $items = @()
    if ($doc.items) { $items = @($doc.items) }
    elseif ($doc.kind -eq 'Certificate') { $items = @($doc) }
    return $items
}

function Get-ClusterCertificatesByNamespace {
    param(
        [string[]]$Namespaces,
        [string]$ClusterName
    )

    $nsResult = Resolve-ClusterNamespaces -RequestedNamespaces $Namespaces
    if ($nsResult.Available.Count -eq 0) {
        $requested = $Namespaces -join ', '
        throw "None of the requested namespaces exist on cluster '$ClusterName': $requested"
    }
    if ($nsResult.Missing.Count -gt 0) {
        Write-Warning "Cluster $ClusterName missing namespace(s): $($nsResult.Missing -join ', '). Searching available: $($nsResult.Available -join ', ')"
    }

    $certsByNamespace = @{}
    foreach ($ns in $nsResult.Available) {
        $certsByNamespace[$ns] = @(Get-ClusterCertificates -Ns $ns)
    }

    return [pscustomobject]@{
        CertsByNamespace    = $certsByNamespace
        AvailableNamespaces = $nsResult.Available
        MissingNamespaces   = $nsResult.Missing
    }
}

function Find-CertificateForRowInNamespaces {
    param(
        [hashtable]$CertsByNamespace,
        [string[]]$SearchOrder,
        [object]$Row,
        [string]$CertNameColumnName,
        [string]$DefaultName,
        [string]$HostColumnName
    )

    foreach ($ns in $SearchOrder) {
        if (-not $CertsByNamespace.ContainsKey($ns)) { continue }
        $match = Find-CertificateForRow -Certificates $CertsByNamespace[$ns] -Row $Row `
            -CertNameColumnName $CertNameColumnName -DefaultName $DefaultName `
            -HostColumnName $HostColumnName
        if ($match) {
            return [pscustomobject]@{
                Certificate = $match
                Namespace   = $ns
            }
        }
    }
    return $null
}

function Find-CertificateForRow {
    param(
        [array]$Certificates,
        [object]$Row,
        [string]$CertNameColumnName,
        [string]$DefaultName,
        [string]$HostColumnName
    )

    if (-not $Certificates -or $Certificates.Count -eq 0) { return $null }

    $explicitName = Get-RowValue -Row $Row -ColumnName $CertNameColumnName
    if ($explicitName) {
        $match = $Certificates | Where-Object { $_.metadata.name -eq $explicitName } | Select-Object -First 1
        if ($match) { return $match }
    }

    $hostVal = Get-RowValue -Row $Row -ColumnName $HostColumnName
    $hostCandidates = Get-HostLookupCandidates -HostValue $hostVal
    if ($hostCandidates.Count -gt 0) {
        $byHost = $Certificates | Where-Object {
            Test-CertificateMatchesHost -Certificate $_ -HostCandidates $hostCandidates
        } | Select-Object -First 1
        if ($byHost) { return $byHost }
    }

    if ($DefaultName) {
        $byMetaName = $Certificates | Where-Object { ($_.metadata.name -as [string]) -ieq $DefaultName } | Select-Object -First 1
        if ($byMetaName) { return $byMetaName }

        # kong-default-tls is usually spec.secretName, not metadata.name
        $bySecret = $Certificates | Where-Object { ($_.spec.secretName -as [string]) -ieq $DefaultName } | Select-Object -First 1
        if ($bySecret) { return $bySecret }
    }

    $cluster = Get-ClusterNameFromHost -HostValue $hostVal
    if ($cluster) {
        $byCluster = $Certificates | Where-Object {
            ($_.metadata.name -as [string]) -like "*$cluster*"
        } | Select-Object -First 1
        if ($byCluster) { return $byCluster }
    }

    if ($Certificates.Count -eq 1) {
        return $Certificates[0]
    }

    return $null
}

function Initialize-GdceKubectlCredentials {
    if (-not (Test-Path -LiteralPath $ConnectScript)) {
        throw "Connect script not found: $ConnectScript"
    }

    $connectArgs = @{
        ConfigureCredentialsOnly = $true
        ReuseCredentials         = $true
    }
    if ($env:KUBECTL_CREDENTIALS_NAME) {
        $connectArgs['CredentialsName'] = $env:KUBECTL_CREDENTIALS_NAME
    }

    Write-Host '==== One-time kubectl credentials (Connect-GdceCluster.ps1) ===='
    & $ConnectScript @connectArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Connect-GdceCluster.ps1 credential setup failed (exit $LASTEXITCODE)"
    }
    Write-Host ''
}

function Connect-GdceClusterForCheck {
    param(
        [string]$Cluster,
        [hashtable]$FleetMap
    )

    if (-not (Test-Path -LiteralPath $ConnectScript)) {
        throw "Connect script not found: $ConnectScript"
    }

    $fleetProject = Resolve-GdceFleetProjectId -Cluster $Cluster -Map $FleetMap

    $connectArgs = @{
        ClusterName      = $Cluster
        SkipNodeCheck    = $true
        ReuseCredentials = $true
        NonInteractive   = $true
    }
    if ($fleetProject) {
        $connectArgs['FleetProjectId'] = $fleetProject
    }
    if ($env:KUBECTL_CREDENTIALS_NAME) {
        $connectArgs['CredentialsName'] = $env:KUBECTL_CREDENTIALS_NAME
    }

    Write-Host "==== Connecting cluster: $Cluster (Connect-GdceCluster.ps1) ===="
    & $ConnectScript @connectArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Connect-GdceCluster.ps1 failed for cluster '$Cluster' (exit $LASTEXITCODE)"
    }
}

function Set-RowNote {
    param(
        [pscustomobject]$Row,
        [string]$Text
    )
    $existing = Get-RowValue -Row $Row -ColumnName $NotesColumn
    if ($existing) {
        $Row.$NotesColumn = "$existing; $Text"
    } else {
        $Row | Add-Member -NotePropertyName $NotesColumn -NotePropertyValue $Text -Force
    }
}

# --- Main ---

$InputPath = Resolve-InputPath -Path $InputPath
$rows = Import-SpreadsheetRows -Path $InputPath
if ($rows.Count -eq 0) {
    throw 'Input file contains no data rows.'
}

if (-not $HostColumn) {
    $HostColumn = Find-HostColumnName -Rows $rows -PreferredNames @(
        'Issued CN', 'Common Name', 'Hostname', 'Host Name', 'DNS Name', 'Subject', 'Certificate Name', 'Name'
    )
}
if (-not $HostColumn) {
    throw 'Could not detect host column. Pass -HostColumn (column with values like ecspci.ci003.kroger.com).'
}

$ResolvedClusterTypeColumn = Resolve-InputColumnName -Rows $rows -PreferredName $ClusterTypeColumn
if (-not $ResolvedClusterTypeColumn) {
    Write-Warning "Column '$ClusterTypeColumn' not found in input; all rows treated as dual cluster type."
}

Write-Host "Input file   : $InputPath"
Write-Host "Host column  : $HostColumn"
if ($ResolvedClusterTypeColumn) {
    Write-Host "Cluster type : $ResolvedClusterTypeColumn (dual / hybrid)"
} else {
    Write-Host "Cluster type : (column missing; default dual)"
}
Write-Host "Effective col: $EffectiveDateColumn"
Write-Host "Expiration col: $ExpirationDateColumn"
Write-Host "Script Validation column : $ScriptValidationColumn (Yes / No / Unknown=infrastructure failure)"
Write-Host "Namespace(s) : $NamespaceDisplay"
Write-Host "Rows         : $($rows.Count)"
if (-not $SkipConnect) {
    Write-Host "Connect      : one-time set-credentials, then Connect-GdceCluster.ps1 per cluster (-ReuseCredentials)"
}
Write-Host ''

# Ensure output columns exist on each row
$enriched = foreach ($row in $rows) {
    $clone = [pscustomobject]@{}
    foreach ($p in $row.PSObject.Properties) {
        $clone | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value
    }
    $hostVal = Get-RowValue -Row $clone -ColumnName $HostColumn
    $clusterType = Get-ClusterTypeForRow -Row $clone -ColumnName $ResolvedClusterTypeColumn
    $cluster = Get-ClusterNameForRow -HostValue $hostVal -ClusterType $clusterType
    $clone | Add-Member -NotePropertyName $ClusterColumn -NotePropertyValue $cluster -Force
    Set-RowColumnValue -Row $clone -ColumnName $ScriptValidationColumn -Value ''
    Set-RowColumnValue -Row $clone -ColumnName $NotesColumn -Value ''
    $clone
}

$certCache = @{}
$clusters = $enriched |
    ForEach-Object { $_.$ClusterColumn } |
    Where-Object { $_ } |
    Select-Object -Unique

$sotPath = Get-GdceSourceOfTruthPath
$fleetProjectMap = Get-GdceFleetProjectMap -CsvPath $sotPath
if ($sotPath) {
    Write-Host "SOT           : $sotPath"
}

if (-not $SkipConnect) {
    Initialize-GdceKubectlCredentials
}

foreach ($cluster in $clusters) {
    $clusterRows = $enriched | Where-Object { $_.$ClusterColumn -eq $cluster }
    try {
        if (-not $SkipConnect) {
            Connect-GdceClusterForCheck -Cluster $cluster -FleetMap $fleetProjectMap
        } else {
            Write-Host "==== SkipConnect: using current context for cluster $cluster ===="
        }

        if (-not $certCache.ContainsKey($cluster)) {
            $certCache[$cluster] = Get-ClusterCertificatesByNamespace `
                -Namespaces $NamespaceList -ClusterName $cluster
        }
        $clusterCertData = $certCache[$cluster]

        foreach ($row in $clusterRows) {
            $hostVal = Get-RowValue -Row $row -ColumnName $HostColumn
            $clusterType = Get-ClusterTypeForRow -Row $row -ColumnName $ResolvedClusterTypeColumn
            $rowNamespaces = Get-RowSearchNamespaces -HostValue $hostVal -ClusterType $clusterType -AllNamespaces $NamespaceList

            if ($rowNamespaces.Count -eq 0) {
                $filterHint = if ($clusterType -ieq 'hybrid') {
                    $parts = ($hostVal -as [string]).Split('.')
                    $firstLabel = if ($parts.Count -gt 0) { $parts[0] } else { '' }
                    if ($firstLabel -match 'pci') {
                        "Hybrid row: no namespace containing 'pci' in -Namespace list ($NamespaceDisplay)"
                    } elseif ($firstLabel -match 'fuel') {
                        "Hybrid row: no namespace containing 'fuel' in -Namespace list ($NamespaceDisplay)"
                    } else {
                        "Hybrid row: no non-pci/non-fuel namespace in -Namespace list ($NamespaceDisplay)"
                    }
                } else {
                    "No namespaces configured for comparison"
                }
                Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
                    -EffectiveMatches $false -ExpirationMatches $false `
                    -Note $filterHint
                continue
            }

            $availableForRow = @($rowNamespaces | Where-Object { $clusterCertData.CertsByNamespace.ContainsKey($_) })
            $missingForRow = @($rowNamespaces | Where-Object { -not $clusterCertData.CertsByNamespace.ContainsKey($_) })
            $searchedNamespaces = $availableForRow -join ', '

            if ($availableForRow.Count -eq 0) {
                $notFoundNote = "Certificate not found; requested namespace(s) not on cluster: $($rowNamespaces -join ', ')"
                Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
                    -EffectiveMatches $false -ExpirationMatches $false `
                    -Note $notFoundNote
                continue
            }

            $matchResult = Find-CertificateForRowInNamespaces `
                -CertsByNamespace $clusterCertData.CertsByNamespace `
                -SearchOrder $rowNamespaces `
                -Row $row `
                -CertNameColumnName $CertNameColumn -DefaultName $DefaultCertName `
                -HostColumnName $HostColumn

            if (-not $matchResult) {
                $notFoundNote = "Certificate not found in namespace(s): $searchedNamespaces"
                if ($missingForRow.Count -gt 0) {
                    $notFoundNote += "; namespace(s) not on cluster: $($missingForRow -join ', ')"
                }
                if ($clusterType -ieq 'hybrid') {
                    $notFoundNote += " (hybrid; cluster type=$clusterType)"
                }
                Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
                    -EffectiveMatches $false -ExpirationMatches $false `
                    -Note $notFoundNote
                continue
            }

            $cert = $matchResult.Certificate
            $foundNamespace = $matchResult.Namespace
            $status = $cert.status
            if (-not $status) {
                Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
                    -EffectiveMatches $false -ExpirationMatches $false `
                    -Note "Certificate $($cert.metadata.name) in $foundNamespace has no status"
                continue
            }

            $fileEffective = Get-RowValue -Row $row -ColumnName $EffectiveDateColumn
            $fileExpiration = Get-RowValue -Row $row -ColumnName $ExpirationDateColumn
            $kubeNotBefore = ($status.notBefore -as [string]).Trim()
            $kubeNotAfter = ($status.notAfter -as [string]).Trim()

            $effMatch = Test-DateMatch -Expected $fileEffective -Actual $kubeNotBefore
            $expMatch = Test-DateMatch -Expected $fileExpiration -Actual $kubeNotAfter

            $note = ''
            if (-not $effMatch -or -not $expMatch) {
                $note = "cert=$($cert.metadata.name) (ns=$foundNamespace); file effective/expiration: $fileEffective / $fileExpiration; kube notBefore/notAfter: $kubeNotBefore / $kubeNotAfter"
            }
            Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
                -EffectiveMatches $effMatch -ExpirationMatches $expMatch -Note $note
        }
    } catch {
        $errMsg = $_.Exception.Message
        foreach ($row in $clusterRows) {
            Set-RowUnknownResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn -Note $errMsg
        }
        Write-Warning "Cluster $cluster validation blocked: $errMsg"
    }
}

# Rows without parseable cluster
foreach ($row in ($enriched | Where-Object { -not $_.$ClusterColumn })) {
    Set-RowValidResult -Row $row -ScriptValidationColumnName $ScriptValidationColumn `
        -EffectiveMatches $false -ExpirationMatches $false `
        -Note "Could not parse cluster from host column '$HostColumn'"
}

if (-not $OutputPath) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($InputPath)
    if ($base -match '\.csv$') { $base = [System.IO.Path]::GetFileNameWithoutExtension($base) }
    $OutputPath = Join-Path (Split-Path -Parent $InputPath) "${base}-validated.csv"
}

$enriched | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8

$yesValid = @($enriched | Where-Object { (Get-RowValue -Row $_ -ColumnName $ScriptValidationColumn) -ieq 'Yes' }).Count
$noValid = @($enriched | Where-Object { (Get-RowValue -Row $_ -ColumnName $ScriptValidationColumn) -ieq 'No' }).Count
$unknownValid = @($enriched | Where-Object { (Get-RowValue -Row $_ -ColumnName $ScriptValidationColumn) -ieq 'Unknown' }).Count
$noRows = @($enriched | Where-Object { (Get-RowValue -Row $_ -ColumnName $ScriptValidationColumn) -ieq 'No' })
$unknownRows = @($enriched | Where-Object { (Get-RowValue -Row $_ -ColumnName $ScriptValidationColumn) -ieq 'Unknown' })
$clusterCount = @($clusters | Where-Object { $_ }).Count

Write-Host ''
Write-Host '==== Summary ===='
Write-Host ''
Write-Host "Compared (CertQuery vs cert-manager Certificate in namespace(s): $NamespaceDisplay):"
Write-Host "  $ClusterTypeColumn -> dual: ecs/ecspci routing with -pci suffix; hybrid: 2nd label = cluster, pci/fuel namespace filter"
Write-Host "  $HostColumn        -> dual: ecs.* -> {cluster}; ecspci.* -> {cluster}-pci"
Write-Host "  hybrid $HostColumn -> 2nd label = cluster; 1st label pci/fuel selects matching -Namespace values"
Write-Host "  $EffectiveDateColumn   -> status.notBefore"
Write-Host "  $ExpirationDateColumn  -> status.notAfter"
Write-Host '  Match rule       -> exact UTC timestamp match (to the second)'
Write-Host ''
Write-Host 'Results:'
Write-Host "  Rows processed   : $($enriched.Count)"
Write-Host "  Script Validation = Yes      : $yesValid  (CertQuery timestamps match cluster cert exactly)"
Write-Host "  Script Validation = No       : $noValid"
Write-Host "  Script Validation = Unknown  : $unknownValid  (connect/kubectl/gcloud or other infrastructure failure)"
Write-Host "  Clusters checked : $clusterCount"
Write-Host "  Output file      : $OutputPath"

if ($unknownRows.Count -gt 0) {
    Write-Host ''
    Write-Host 'Unknown rows (infrastructure/connect failure — see ValidationNotes):'
    foreach ($row in $unknownRows) {
        $issuedCn = Get-RowValue -Row $row -ColumnName $HostColumn
        $clusterName = Get-RowValue -Row $row -ColumnName $ClusterColumn
        $note = Get-RowValue -Row $row -ColumnName $NotesColumn
        if ($note -and $note.Length -gt 120) {
            $note = $note.Substring(0, 117) + '...'
        }
        if ($clusterName) {
            Write-Host "  - $issuedCn ($clusterName)"
        } else {
            Write-Host "  - $issuedCn"
        }
        if ($note) {
            Write-Host "      $note"
        }
    }
}

if ($noRows.Count -gt 0) {
    Write-Host ''
    Write-Host 'No rows (see ValidationNotes in output file):'
    foreach ($row in $noRows) {
        $issuedCn = Get-RowValue -Row $row -ColumnName $HostColumn
        $clusterName = Get-RowValue -Row $row -ColumnName $ClusterColumn
        $note = Get-RowValue -Row $row -ColumnName $NotesColumn
        if ($note -and $note.Length -gt 120) {
            $note = $note.Substring(0, 117) + '...'
        }
        if ($clusterName) {
            Write-Host "  - $issuedCn ($clusterName)"
        } else {
            Write-Host "  - $issuedCn"
        }
        if ($note) {
            Write-Host "      $note"
        }
    }
}

Write-Host ''
Write-Host 'Done.'
