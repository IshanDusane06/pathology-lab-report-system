import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { labSettingsApi, LabSettings } from "@/services/labSettingsApi";

const AdminLabSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<LabSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await labSettingsApi.getLabSettings();
      setSettings(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load lab settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await labSettingsApi.updateLabSettings({
        labName: settings.labName,
        tagline: settings.tagline,
        registrationNumber: settings.registrationNumber,
        address: settings.address,
        workflowPolicy: settings.workflowPolicy,
        email: settings.email,
      });
      setSettings(updated);
      toast({ title: "Settings saved" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const { to } = await labSettingsApi.sendTestEmail();
      toast({ title: "Test email sent", description: `Check ${to}.` });
    } catch (error) {
      toast({
        title: "Test email failed",
        description: error instanceof Error ? error.message : "Could not send the test email",
        variant: "destructive",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleReverify = async () => {
    setReverifying(true);
    try {
      const result = await labSettingsApi.reverifySignatures();
      await load();
      toast({
        title: result.mismatches.length === 0 ? "All signatures verified" : "Mismatches found",
        description: `Checked ${result.checked} signature${result.checked === 1 ? "" : "s"}, ${result.mismatches.length} mismatch${result.mismatches.length === 1 ? "" : "es"}.`,
        variant: result.mismatches.length === 0 ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to re-verify signatures",
        variant: "destructive",
      });
    } finally {
      setReverifying(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="py-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const policy = settings.workflowPolicy;
  const setPolicy = (updates: Partial<LabSettings["workflowPolicy"]>) =>
    setSettings({ ...settings, workflowPolicy: { ...policy, ...updates } });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div>
            <h3 className="font-semibold">Lab profile</h3>
            <p className="text-xs text-muted-foreground mb-4">Appears on the letterhead of every printed report</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Lab name</Label>
                <Input value={settings.labName} onChange={(e) => setSettings({ ...settings, labName: e.target.value })} />
              </div>
              <div>
                <Label>Tagline</Label>
                <Input
                  value={settings.tagline}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  placeholder="e.g. Computerised Clinical Laboratory"
                />
              </div>
              <div>
                <Label>Registration no.</Label>
                <Input
                  value={settings.registrationNumber}
                  onChange={(e) => setSettings({ ...settings, registrationNumber: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Workflow policy</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Second doctor review for critical values</p>
                  <p className="text-xs text-muted-foreground">Panic-range results need a second sign-off — not enforced yet</p>
                </div>
                <Switch
                  checked={policy.secondDoctorReviewForCritical}
                  onCheckedChange={(v) => setPolicy({ secondDoctorReviewForCritical: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Limit un-sign to 24 hours after signing</p>
                  <p className="text-xs text-muted-foreground">After that a correction needs a fresh report</p>
                </div>
                <Switch
                  checked={!!policy.limitUnsignHours}
                  onCheckedChange={(v) => setPolicy({ limitUnsignHours: v ? 24 : null })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Comment required on changes requested</p>
                  <p className="text-xs text-muted-foreground">Technician always sees a reason — always on, enforced server-side</p>
                </div>
                <Switch checked disabled />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-suspend after 60 days inactive</p>
                  <p className="text-xs text-muted-foreground">Access revoked until an admin restores it — not enforced yet</p>
                </div>
                <Switch
                  checked={!!policy.autoSuspendAfterDaysInactive}
                  onCheckedChange={(v) => setPolicy({ autoSuspendAfterDaysInactive: v ? 60 : null })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Two-factor for doctors and admins</p>
                  <p className="text-xs text-muted-foreground">OTP on every new device — not enforced yet</p>
                </div>
                <Switch
                  checked={policy.twoFactorForDoctorsAndAdmins}
                  onCheckedChange={(v) => setPolicy({ twoFactorForDoctorsAndAdmins: v })}
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Report delivery</CardTitle>
            <CardDescription>Channels available for signed reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">Print</span>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Live
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">PDF export</span>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Live
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">Email</span>
              <Badge
                variant="outline"
                className={
                  settings.emailConfigured
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-orange-50 text-orange-700 border-orange-200"
                }
              >
                {settings.emailConfigured ? "Live" : "Needs SMTP"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium">WhatsApp</span>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                Planned
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email</CardTitle>
            <CardDescription>How report emails appear to patients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SMTP credentials live in the server environment, never in the
                database — this only reports whether they're present. */}
            {settings.emailConfigured ? (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
                SMTP is configured on the server
                {settings.smtpAccount ? ` (${settings.smtpAccount})` : ""}.
              </p>
            ) : (
              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2">
                SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in the API
                environment — credentials are never stored in the database.
              </p>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable report emails</p>
                <p className="text-xs text-muted-foreground">Allow signed reports to be emailed</p>
              </div>
              <Switch
                checked={!!settings.email?.enabled}
                onCheckedChange={(v) =>
                  setSettings({ ...settings, email: { ...settings.email, enabled: v } })
                }
              />
            </div>

            <div>
              <Label htmlFor="senderName">Sender name</Label>
              <Input
                id="senderName"
                value={settings.email?.senderName || ""}
                onChange={(e) =>
                  setSettings({ ...settings, email: { ...settings.email, senderName: e.target.value } })
                }
                placeholder={settings.labName || "e.g. Precise Clinical Lab"}
              />
            </div>

            <div>
              <Label htmlFor="senderAddress">Sender email address</Label>
              <Input
                id="senderAddress"
                type="email"
                value={settings.email?.senderAddress || ""}
                onChange={(e) =>
                  setSettings({ ...settings, email: { ...settings.email, senderAddress: e.target.value } })
                }
                placeholder="reports@yourlab.com"
              />
              {/* Gmail rewrites or rejects a From address that isn't the
                  authenticated account or a verified alias — worth catching
                  here rather than at send time. */}
              {settings.smtpAccount &&
                settings.email?.senderAddress &&
                settings.email.senderAddress !== settings.smtpAccount && (
                  <p className="text-xs text-orange-700 mt-1">
                    This differs from the SMTP account ({settings.smtpAccount}). Most providers,
                    Gmail included, will rewrite or reject it unless it's a verified alias.
                  </p>
                )}
            </div>

            <div>
              <Label htmlFor="replyTo">Reply-to address (optional)</Label>
              <Input
                id="replyTo"
                type="email"
                value={settings.email?.replyTo || ""}
                onChange={(e) =>
                  setSettings({ ...settings, email: { ...settings.email, replyTo: e.target.value } })
                }
                placeholder="frontdesk@yourlab.com"
              />
            </div>

            <div>
              <Label htmlFor="footerNote">Footer note (optional)</Label>
              <Textarea
                id="footerNote"
                value={settings.email?.footerNote || ""}
                onChange={(e) =>
                  setSettings({ ...settings, email: { ...settings.email, footerNote: e.target.value } })
                }
                placeholder="e.g. For queries call 020-1234567 between 9am and 6pm."
                className="resize-none"
                rows={2}
              />
            </div>

            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={testingEmail || !settings.emailConfigured}
              className="w-full"
            >
              {testingEmail ? "Sending..." : "Send test email"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Sends to your own account's address. Save your changes first — the test uses the
              saved settings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signature integrity</CardTitle>
            <CardDescription>SHA-256 content hash with an HMAC over it, recorded per signature</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
              {settings.lastVerification.at ? (
                <>
                  last verified · {new Date(settings.lastVerification.at).toLocaleString()}
                  <br />
                  {settings.lastVerification.checked} signatures checked, {settings.lastVerification.mismatches} mismatch
                  {settings.lastVerification.mismatches === 1 ? "" : "es"}
                </>
              ) : (
                "Never verified yet"
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={handleReverify} disabled={reverifying}>
              {reverifying ? "Verifying..." : "Re-verify all signatures"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLabSettingsTab;
