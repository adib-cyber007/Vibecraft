param([Parameter(Mandatory=$true)][string]$ArchiveFile,[Parameter(Mandatory=$true)][string]$DestinationDirectory)
$ErrorActionPreference='Stop'
$taskArchive=(Resolve-Path -LiteralPath $ArchiveFile).Path
$taskDestination=[IO.Path]::GetFullPath($DestinationDirectory)
if(Test-Path -LiteralPath $taskDestination){throw 'Verification destination must be a new directory.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($taskArchive,$taskDestination)
