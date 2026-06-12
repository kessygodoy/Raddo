$ErrorActionPreference = "Stop"

$projectRef = "zsmfrfiemthftuiyursr"
$token = $env:SUPABASE_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User")
}
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "Machine")
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "SUPABASE_ACCESS_TOKEN is not set. Set it in this PowerShell session or in the Windows user environment before running this script."
}

function New-RaddoTemplate {
  param(
    [string]$Title,
    [string]$Intro,
    [string]$ButtonText,
    [string]$Footer = "If you did not request this, you can safely ignore this email."
  )

  return @"
<div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 18px 28px;">
              <div style="font-size:24px;font-weight:800;color:#ff315d;letter-spacing:0;">Raddo</div>
              <h1 style="margin:22px 0 10px 0;font-size:22px;line-height:1.3;color:#0f172a;">$Title</h1>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#475569;">$Intro</p>
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#ff315d;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;font-size:15px;">$ButtonText</a>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">$Footer</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
"@
}

function New-RaddoCodeTemplate {
  param(
    [string]$Title,
    [string]$Intro,
    [string]$Footer = "If you did not request this, you can safely ignore this email."
  )

  return @"
<div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px;">
              <div style="font-size:24px;font-weight:800;color:#ff315d;letter-spacing:0;">Raddo</div>
              <h1 style="margin:22px 0 10px 0;font-size:22px;line-height:1.3;color:#0f172a;">$Title</h1>
              <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#475569;">$Intro</p>
              <div style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:14px 18px;font-size:24px;font-weight:800;letter-spacing:4px;color:#0f172a;">{{ .Token }}</div>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">$Footer</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
"@
}

function New-RaddoNotificationTemplate {
  param(
    [string]$Title,
    [string]$Intro,
    [string]$Footer = "If this was you, no action is needed."
  )

  return @"
<div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px;">
              <div style="font-size:24px;font-weight:800;color:#ff315d;letter-spacing:0;">Raddo</div>
              <h1 style="margin:22px 0 10px 0;font-size:22px;line-height:1.3;color:#0f172a;">$Title</h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">$Intro</p>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#64748b;">$Footer</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
"@
}

$payload = @{
  mailer_subjects_confirmation = "Welcome to Raddo - confirm your email"
  mailer_templates_confirmation_content = New-RaddoTemplate `
    -Title "Welcome to Raddo" `
    -Intro "Confirm your email address to finish setting up your Raddo account and start meeting people nearby." `
    -ButtonText "Confirm email"

  mailer_subjects_recovery = "Raddo password reset link"
  mailer_templates_recovery_content = New-RaddoTemplate `
    -Title "Create a new Raddo password" `
    -Intro "We received a request to reset the password for your Raddo account. Use the secure link below to create a new password." `
    -ButtonText "Create new password"

  mailer_subjects_magic_link = "Your Raddo sign-in link"
  mailer_templates_magic_link_content = New-RaddoTemplate `
    -Title "Sign in to Raddo" `
    -Intro "Use this secure link to sign in to your Raddo account. The link can only be used for a short time." `
    -ButtonText "Sign in to Raddo"

  mailer_subjects_invite = "You have been invited to Raddo"
  mailer_templates_invite_content = New-RaddoTemplate `
    -Title "You are invited to Raddo" `
    -Intro "Someone invited you to join Raddo. Create your account and start connecting with people nearby." `
    -ButtonText "Accept invitation"

  mailer_subjects_email_change = "Confirm your new Raddo email"
  mailer_templates_email_change_content = New-RaddoTemplate `
    -Title "Confirm your new email" `
    -Intro "Confirm that you want to use {{ .NewEmail }} as the email address for your Raddo account." `
    -ButtonText "Confirm new email"

  mailer_subjects_reauthentication = "Raddo verification code"
  mailer_templates_reauthentication_content = New-RaddoCodeTemplate `
    -Title "Verify it is you" `
    -Intro "Use this code to continue with your secure Raddo account action."

  mailer_subjects_password_changed_notification = "Your Raddo password was changed"
  mailer_templates_password_changed_notification_content = New-RaddoNotificationTemplate `
    -Title "Your password was changed" `
    -Intro "This is a confirmation that the password for your Raddo account was changed." `
    -Footer "If this was not you, reset your password immediately."

  mailer_subjects_email_changed_notification = "Your Raddo email was changed"
  mailer_templates_email_changed_notification_content = New-RaddoNotificationTemplate `
    -Title "Your email was changed" `
    -Intro "The email address for your Raddo account was changed from {{ .OldEmail }} to {{ .NewEmail }}." `
    -Footer "If this was not you, contact support and secure your account."

  mailer_subjects_phone_changed_notification = "Your Raddo phone number was changed"
  mailer_templates_phone_changed_notification_content = New-RaddoNotificationTemplate `
    -Title "Your phone number was changed" `
    -Intro "The phone number for your Raddo account was changed from {{ .OldPhone }} to {{ .Phone }}." `
    -Footer "If this was not you, contact support and secure your account."

  mailer_subjects_identity_linked_notification = "A sign-in method was added to Raddo"
  mailer_templates_identity_linked_notification_content = New-RaddoNotificationTemplate `
    -Title "A sign-in method was added" `
    -Intro "A {{ .Provider }} sign-in method was added to your Raddo account." `
    -Footer "If this was not you, remove the sign-in method and secure your account."

  mailer_subjects_identity_unlinked_notification = "A sign-in method was removed from Raddo"
  mailer_templates_identity_unlinked_notification_content = New-RaddoNotificationTemplate `
    -Title "A sign-in method was removed" `
    -Intro "A {{ .Provider }} sign-in method was removed from your Raddo account." `
    -Footer "If this was not you, review your account security."

  mailer_subjects_mfa_factor_enrolled_notification = "A new verification method was added to Raddo"
  mailer_templates_mfa_factor_enrolled_notification_content = New-RaddoNotificationTemplate `
    -Title "A new verification method was added" `
    -Intro "A new {{ .FactorType }} verification method was added to your Raddo account." `
    -Footer "If this was not you, review your account security."

  mailer_subjects_mfa_factor_unenrolled_notification = "A verification method was removed from Raddo"
  mailer_templates_mfa_factor_unenrolled_notification_content = New-RaddoNotificationTemplate `
    -Title "A verification method was removed" `
    -Intro "A {{ .FactorType }} verification method was removed from your Raddo account." `
    -Footer "If this was not you, review your account security."
}

$body = $payload | ConvertTo-Json -Depth 8
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}

$uri = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $body | Out-Null

Write-Host "Raddo Supabase auth email templates updated for project $projectRef."
