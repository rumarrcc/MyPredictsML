Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\config.ps1"

try {
    $bucketExists = aws s3api head-bucket --bucket $Global:S3_BUCKET 2>$null
    if ($LASTEXITCODE -ne 0) {
        aws s3api create-bucket --bucket $Global:S3_BUCKET --region $Global:AWS_REGION | Out-Null
    }
    aws s3api put-public-access-block --bucket $Global:S3_BUCKET --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null

    $oacName = "$Global:APP-oac"
    $oacId = aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='$oacName'].Id | [0]" --output text 2>$null
    if (-not $oacId -or $oacId -eq "None") {
        $oacConfigPath = Join-Path $Global:OUTPUT_DIR "oac-config.json"
        @{
            Name = $oacName
            Description = "OAC for MyPredicts frontend"
            SigningProtocol = "sigv4"
            SigningBehavior = "always"
            OriginAccessControlOriginType = "s3"
        } | ConvertTo-Json | Out-File -Encoding utf8 $oacConfigPath
        $oacId = aws cloudfront create-origin-access-control --origin-access-control-config "file://$oacConfigPath" --query "OriginAccessControl.Id" --output text
    }

    $existingDistribution = aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[?DomainName=='$Global:S3_BUCKET.s3.$Global:AWS_REGION.amazonaws.com']].Id | [0]" --output text 2>$null
    if (-not $existingDistribution -or $existingDistribution -eq "None") {
        $distConfigPath = Join-Path $Global:OUTPUT_DIR "cloudfront-distribution.json"
        $distributionConfig = @{
            CallerReference = "$Global:APP-$(Get-Date -Format yyyyMMddHHmmss)"
            Comment = "MyPredicts frontend"
            Enabled = $true
            DefaultRootObject = "index.html"
            Origins = @{
                Quantity = 1
                Items = @(@{
                    Id = "s3-$Global:S3_BUCKET"
                    DomainName = "$Global:S3_BUCKET.s3.$Global:AWS_REGION.amazonaws.com"
                    OriginAccessControlId = $oacId
                    S3OriginConfig = @{ OriginAccessIdentity = "" }
                })
            }
            DefaultCacheBehavior = @{
                TargetOriginId = "s3-$Global:S3_BUCKET"
                ViewerProtocolPolicy = "redirect-to-https"
                AllowedMethods = @{ Quantity = 2; Items = @("GET", "HEAD"); CachedMethods = @{ Quantity = 2; Items = @("GET", "HEAD") } }
                Compress = $true
                CachePolicyId = "658327ea-f89d-4fab-a63d-7e88639e58f6"
            }
            CustomErrorResponses = @{
                Quantity = 2
                Items = @(
                    @{ ErrorCode = 403; ResponsePagePath = "/index.html"; ResponseCode = "200"; ErrorCachingMinTTL = 0 },
                    @{ ErrorCode = 404; ResponsePagePath = "/index.html"; ResponseCode = "200"; ErrorCachingMinTTL = 0 }
                )
            }
        }
        $distributionConfig | ConvertTo-Json -Depth 20 | Out-File -Encoding utf8 $distConfigPath
        $dist = aws cloudfront create-distribution --distribution-config "file://$distConfigPath" | ConvertFrom-Json
        $distributionId = $dist.Distribution.Id
        $domainName = $dist.Distribution.DomainName
    } else {
        $distributionId = $existingDistribution
        $domainName = aws cloudfront get-distribution --id $distributionId --query "Distribution.DomainName" --output text
    }

    $bucketPolicyPath = Join-Path $Global:OUTPUT_DIR "bucket-policy.json"
    $sourceArn = "arn:aws:cloudfront::$($Global:AWS_ACCOUNT_ID):distribution/$distributionId"
    @{
        Version = "2012-10-17"
        Statement = @(@{
            Sid = "AllowCloudFrontServicePrincipalReadOnly"
            Effect = "Allow"
            Principal = @{ Service = "cloudfront.amazonaws.com" }
            Action = "s3:GetObject"
            Resource = "arn:aws:s3:::$($Global:S3_BUCKET)/*"
            Condition = @{ StringEquals = @{ "AWS:SourceArn" = $sourceArn } }
        })
    } | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 $bucketPolicyPath
    aws s3api put-bucket-policy --bucket $Global:S3_BUCKET --policy "file://$bucketPolicyPath" | Out-Null

    @{
        Bucket = $Global:S3_BUCKET
        DistributionId = $distributionId
        CloudFrontDomain = $domainName
    } | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Global:OUTPUT_DIR "cloudfront.json")
    Write-Host "CloudFront: https://$domainName"
} catch {
    Write-Host "No se pudo crear S3/CloudFront: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Fallback: servir frontend desde Nginx en la misma EC2." -ForegroundColor Yellow
    throw
}
