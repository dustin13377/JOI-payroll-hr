import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edge';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, Pencil, ArrowUp, ArrowDown, X, Save, UserMinus, UserPlus, Trash2, Mail } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getDisplayName } from '@/lib/displayName';

type FieldType = 'number' | 'boolean' | 'text' | 'dropdown';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  number: 'Number',
  boolean: 'Yes / No',
  text: 'Text',
  dropdown: 'Dropdown',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ROLE_LABELS: Record<string, string> = { tl: 'Team Lead', manager: 'Manager', client: 'Client', other: 'Other' };
const ROLE_RANK: Record<string, number> = { tl: 1, manager: 2, client: 3, other: 4 };
const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [string, string][];

const TIMEZONE_OPTIONS = [
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface KPIField {
  id: string;
  campaign_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  min_target: number | null;
  flag_threshold: number | null;
  flag_independent: boolean;
  display_order: number;
  is_active: boolean;
  dropdown_options: string[] | null;
  is_required: boolean;
}

interface ShiftSetting {
  id: string | null;
  campaign_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  days_of_week: number[];
}

interface AssignedAgent {
  id: string;
  employee_id: string;
  full_name: string;
  work_name: string | null;
  title: string | null;
  reports_to: string | null;
}

interface AvailableEmployee {
  id: string;
  employee_id: string;
  full_name: string;
  work_name: string | null;
  campaign_id: string | null;
}

const emptyField = (): Omit<KPIField, 'id' | 'campaign_id' | 'display_order'> => ({
  field_name: '',
  field_label: '',
  field_type: 'number',
  min_target: null,
  flag_threshold: null,
  flag_independent: true,
  is_active: true,
  dropdown_options: null,
  is_required: false,
});

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isOwner, isAdmin, isLeadership, isTeamLead } = useAuth();
  const queryClient = useQueryClient();

  // Campaign info
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');

  // Shift state
  const [shift, setShift] = useState<Partial<ShiftSetting>>({
    shift_name: '',
    start_time: '08:00',
    end_time: '17:00',
    grace_minutes: 10,
    days_of_week: [1, 2, 3, 4, 5],
  });
  const [shiftDirty, setShiftDirty] = useState(false);

  // KPI field dialog
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<KPIField | null>(null);
  const [fieldForm, setFieldForm] = useState(emptyField());
  const [dropdownInput, setDropdownInput] = useState('');

  // Assign employee
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // EOD Digest Recipients
  const [recipientDialogOpen, setRecipientDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientRole, setRecipientRole] = useState('tl');
  const [recipientActive, setRecipientActive] = useState(true);
  const [recipientEmailError, setRecipientEmailError] = useState('');

  // Digest Schedule
  // digestCutoff kept for backward compat (column not dropped) but no longer editable
  const [digestCutoff] = useState('');
  const [digestMorningBundle, setDigestMorningBundle] = useState('');
  const [digestTimezone, setDigestTimezone] = useState('America/Denver');
  const [digestReplyTo, setDigestReplyTo] = useState('');
  const [digestReplyToError, setDigestReplyToError] = useState('');
  const [digestDirty, setDigestDirty] = useState(false);
  const [sendingTestDigest, setSendingTestDigest] = useState(false);
  const [testDigestEmail, setTestDigestEmail] = useState('');
  const [testDigestDate, setTestDigestDate] = useState('');
  const [sendingManualDigest, setSendingManualDigest] = useState(false);
  const [includeAgentsInDigest, setIncludeAgentsInDigest] = useState(false);

  // Early Release state (manager+ only feature)
  const [earlyReleaseEnabled, setEarlyReleaseEnabled] = useState(false);
  const [earlyReleaseCriteria, setEarlyReleaseCriteria] = useState('');
  const [earlyReleaseDirty, setEarlyReleaseDirty] = useState(false);

  // Holiday Coverage toggle mutation
  const holidayCoverageMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('campaigns')
        .update({ requires_holiday_coverage: enabled })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaignsWithHeadcount'] });
      toast.success('Saved');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const invalidateCampaign = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    queryClient.invalidateQueries({ queryKey: ['campaigns-list'] });
    queryClient.invalidateQueries({ queryKey: ['clients-with-campaigns'] });
  };

  // Fetch campaign + parent client
  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, client_id, team_lead_id, eod_digest_cutoff_time, eod_morning_bundle_time, eod_digest_timezone, eod_reply_to_email, requires_holiday_coverage, early_release_enabled, early_release_criteria, include_agents_in_eod_digest, clients(id, name, prefix)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; client_id: string; team_lead_id: string | null; eod_digest_cutoff_time: string | null; eod_morning_bundle_time: string | null; eod_digest_timezone: string; eod_reply_to_email: string | null; requires_holiday_coverage: boolean; early_release_enabled: boolean; early_release_criteria: string | null; include_agents_in_eod_digest: boolean; clients: { id: string; name: string; prefix: string } | null };
    },
    enabled: !!id,
  });

  // Populate name field when campaign loads
  useEffect(() => {
    if (campaign) {
      setNameVal(campaign.name);
    }
  }, [campaign]);

  // Fetch shift settings for this campaign
  const { data: existingShift } = useQuery({
    queryKey: ['campaign-shift', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('shift_settings')
        .select('*')
        .eq('campaign_id', id!)
        .order('shift_name')
        .limit(1)
        .single();
      return data as ShiftSetting | null;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existingShift) {
      setShift({
        id: existingShift.id,
        shift_name: existingShift.shift_name,
        start_time: existingShift.start_time,
        end_time: existingShift.end_time,
        grace_minutes: existingShift.grace_minutes ?? 10,
        days_of_week: existingShift.days_of_week ?? [1, 2, 3, 4, 5],
      });
    }
  }, [existingShift]);

  // Fetch KPI fields
  const { data: kpiFields = [] } = useQuery({
    queryKey: ['kpi-config', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_kpi_config')
        .select('*')
        .eq('campaign_id', id!)
        .order('display_order');
      if (error) throw error;
      return data as KPIField[];
    },
    enabled: !!id,
  });

  // Fetch assigned agents for this campaign
  const { data: assignedAgents = [] } = useQuery({
    queryKey: ['campaign-agents', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_id, full_name, work_name, title, reports_to')
        .eq('campaign_id', id!)
        .eq('is_active', true)
        .eq('is_system_user', false)
        .order('full_name');
      if (error) throw error;
      return data as AssignedAgent[];
    },
    enabled: !!id,
  });

  // Fetch all active employees (for the assign dropdown)
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['all-active-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_id, full_name, work_name, campaign_id')
        .eq('is_active', true)
        .eq('is_system_user', false)
        .order('full_name');
      if (error) throw error;
      return data as AvailableEmployee[];
    },
  });

  // Filter to employees not on this campaign
  const availableEmployees = allEmployees.filter((e) => e.campaign_id !== id);

  // Eligible Team Leads
  const { data: eligibleTLs = [] } = useQuery({
    queryKey: ['eligible-tls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, title')
        .eq('is_active', true)
        .eq('is_system_user', false)
        .in('title', ['team_lead', 'manager', 'admin', 'owner'])
        .order('full_name');
      if (error) throw error;
      return data as { id: string; full_name: string; title: string }[];
    },
  });

  // Save Team Lead
  const saveTLMutation = useMutation({
    mutationFn: async (tlId: string | null) => {
      const { error } = await supabase
        .from('campaigns')
        .update({ team_lead_id: tlId })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCampaign();
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', id] });
      const count = assignedAgents.filter(a => a.id !== saveTLMutation.variables).length;
      toast.success(`TL updated. ${count} agent${count !== 1 ? 's' : ''} now report to the new lead.`);
    },
  });

  const agentCount = assignedAgents.length;

  // Save campaign name
  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('campaigns')
        .update({ name: nameVal.trim() })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCampaign();
      setEditingName(false);
      toast.success('Campaign updated');
    },
  });

  // Save shift
  const saveShiftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        campaign_id: id!,
        shift_name: shift.shift_name || nameVal,
        start_time: shift.start_time!,
        end_time: shift.end_time!,
        grace_minutes: shift.grace_minutes ?? 10,
        days_of_week: shift.days_of_week,
        updated_at: new Date().toISOString(),
      };

      if (shift.id) {
        const { error } = await supabase
          .from('shift_settings')
          .update(payload)
          .eq('id', shift.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('shift_settings')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        setShift((prev) => ({ ...prev, id: data.id }));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-shift', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-list'] });
      setShiftDirty(false);
      toast.success('Shift saved');
    },
  });

  // Remove agent from campaign
  const removeAgentMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from('employees')
        .update({ campaign_id: null })
        .eq('id', employeeId);
      if (error) throw error;
    },
    onSuccess: (_data, employeeId) => {
      const agent = assignedAgents.find((a) => a.id === employeeId);
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', id] });
      queryClient.invalidateQueries({ queryKey: ['all-active-employees'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-list'] });
      toast.success(`Removed ${agent ? getDisplayName(agent) : 'employee'} from ${campaign?.name ?? 'campaign'}. They can be reassigned from their profile.`);
    },
  });

  // Assign employee to campaign
  const assignAgentMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from('employees')
        .update({ campaign_id: id! })
        .eq('id', employeeId);
      if (error) throw error;
    },
    onSuccess: (_data, employeeId) => {
      const emp = allEmployees.find((e) => e.id === employeeId);
      queryClient.invalidateQueries({ queryKey: ['campaign-agents', id] });
      queryClient.invalidateQueries({ queryKey: ['all-active-employees'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-list'] });
      setSelectedEmployeeId('');
      toast.success(`Assigned ${emp ? getDisplayName(emp) : 'employee'} to ${campaign?.name ?? 'campaign'}.`);
    },
  });

  // KPI mutations
  const invalidateKpi = () => queryClient.invalidateQueries({ queryKey: ['kpi-config', id] });

  const saveKpiMutation = useMutation({
    mutationFn: async () => {
      const fieldName =
        fieldForm.field_name ||
        fieldForm.field_label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      const payload = {
        field_name: fieldName,
        field_label: fieldForm.field_label,
        field_type: fieldForm.field_type,
        min_target: fieldForm.field_type === 'number' ? fieldForm.min_target : null,
        flag_threshold: fieldForm.field_type === 'number' ? fieldForm.flag_threshold : null,
        flag_independent: fieldForm.field_type === 'number' ? fieldForm.flag_independent : true,
        dropdown_options: fieldForm.field_type === 'dropdown' ? fieldForm.dropdown_options : null,
        is_active: fieldForm.is_active,
        is_required: fieldForm.is_required,
      };

      if (editingField) {
        const { error } = await supabase.from('campaign_kpi_config').update(payload).eq('id', editingField.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('campaign_kpi_config').insert({
          ...payload,
          campaign_id: id!,
          display_order: kpiFields.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidateKpi(); closeKpiDialog(); },
  });

  const toggleKpiMutation = useMutation({
    mutationFn: async ({ fieldId, is_active }: { fieldId: string; is_active: boolean }) => {
      const { error } = await supabase.from('campaign_kpi_config').update({ is_active }).eq('id', fieldId);
      if (error) throw error;
    },
    onSuccess: invalidateKpi,
  });

  const reorderKpiMutation = useMutation({
    mutationFn: async ({ fieldId, direction }: { fieldId: string; direction: 'up' | 'down' }) => {
      const idx = kpiFields.findIndex((f) => f.id === fieldId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= kpiFields.length) return;
      const a = kpiFields[idx];
      const b = kpiFields[swapIdx];
      const { error } = await supabase.from('campaign_kpi_config').upsert([
        { id: a.id, display_order: b.display_order },
        { id: b.id, display_order: a.display_order },
      ]);
      if (error) throw error;
    },
    onSuccess: invalidateKpi,
  });

  const deleteKpiMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase.from('campaign_kpi_config').delete().eq('id', fieldId);
      if (error) throw error;
    },
    onSuccess: invalidateKpi,
  });

  // ===================== EOD Digest Recipients =====================

  const { data: recipients = [] } = useQuery({
    queryKey: ['eod-recipients', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_eod_recipients')
        .select('*')
        .eq('campaign_id', id!);
      if (error) throw error;
      return (data ?? []).sort((a, b) => {
        // active rows first
        if (a.active !== b.active) return a.active ? -1 : 1;
        // then by role rank: TL(1) → Manager(2) → Client(3) → Other(4)
        const ra = ROLE_RANK[a.role_label] ?? 99;
        const rb = ROLE_RANK[b.role_label] ?? 99;
        if (ra !== rb) return ra - rb;
        // then alphabetical by email
        return a.email.localeCompare(b.email);
      });
    },
    enabled: !!id,
  });

  const invalidateRecipients = () => queryClient.invalidateQueries({ queryKey: ['eod-recipients', id] });

  const addRecipientMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('campaign_eod_recipients').insert({
        campaign_id: id!,
        email: recipientEmail.trim().toLowerCase(),
        role_label: recipientRole,
        active: recipientActive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRecipients();
      closeRecipientDialog();
      toast.success('Recipient added');
    },
    onError: (err: Error) => {
      if (err.message.includes('duplicate')) {
        setRecipientEmailError('This email is already a recipient for this campaign.');
      } else {
        toast.error(err.message);
      }
    },
  });

  const toggleRecipientActiveMutation = useMutation({
    mutationFn: async ({ recipientId, active }: { recipientId: string; active: boolean }) => {
      const { error } = await supabase
        .from('campaign_eod_recipients')
        .update({ active })
        .eq('id', recipientId);
      if (error) throw error;
    },
    onSuccess: invalidateRecipients,
  });

  // Auto-saves the include-agents flag on toggle. Matches the recipients UX
  // pattern (no separate Save button — flip it and it persists).
  const toggleIncludeAgentsMutation = useMutation({
    mutationFn: async (val: boolean) => {
      const { error } = await supabase
        .from('campaigns')
        .update({ include_agents_in_eod_digest: val })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCampaign();
      toast.success('Saved');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    },
  });

  const deleteRecipientMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const { error } = await supabase
        .from('campaign_eod_recipients')
        .delete()
        .eq('id', recipientId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRecipients();
      toast.success('Recipient removed');
    },
  });

  function openRecipientDialog() {
    setRecipientEmail('');
    setRecipientRole('tl');
    setRecipientActive(true);
    setRecipientEmailError('');
    setRecipientDialogOpen(true);
  }

  function closeRecipientDialog() {
    setRecipientDialogOpen(false);
    setRecipientEmail('');
    setRecipientEmailError('');
  }

  function handleAddRecipient() {
    const email = recipientEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setRecipientEmailError('Enter a valid email address.');
      return;
    }
    setRecipientEmailError('');
    addRecipientMutation.mutate();
  }

  // ===================== Digest Schedule =====================

  // Sync local state when campaign data loads
  useEffect(() => {
    if (campaign) {
      setDigestMorningBundle(campaign.eod_morning_bundle_time ?? '');
      setDigestTimezone(campaign.eod_digest_timezone ?? 'America/Denver');
      setDigestReplyTo(campaign.eod_reply_to_email ?? '');
      setDigestReplyToError('');
      setIncludeAgentsInDigest(campaign.include_agents_in_eod_digest ?? false);
      setDigestDirty(false);
      setEarlyReleaseEnabled(campaign.early_release_enabled ?? false);
      setEarlyReleaseCriteria(campaign.early_release_criteria ?? '');
      setEarlyReleaseDirty(false);
    }
  }, [campaign]);

  const saveEarlyReleaseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('campaigns')
        .update({
          early_release_enabled: earlyReleaseEnabled,
          early_release_criteria: earlyReleaseCriteria.trim() || null,
        })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCampaign();
      setEarlyReleaseDirty(false);
      toast.success('Early release settings saved');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    },
  });

  const saveDigestMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('campaigns')
        .update({
          eod_digest_cutoff_time: digestCutoff || null,
          eod_morning_bundle_time: digestMorningBundle || null,
          eod_digest_timezone: digestTimezone,
          eod_reply_to_email: digestReplyTo.trim() || null,
        })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCampaign();
      setDigestDirty(false);
      toast.success('Digest schedule saved');
    },
  });

  function handleSaveDigest() {
    const replyTo = digestReplyTo.trim();
    if (replyTo && !EMAIL_RE.test(replyTo)) {
      setDigestReplyToError('Enter a valid email address or leave blank.');
      return;
    }
    setDigestReplyToError('');
    saveDigestMutation.mutate();
  }

  function openAddKpi() {
    setEditingField(null);
    setFieldForm(emptyField());
    setDropdownInput('');
    setKpiDialogOpen(true);
  }

  function openEditKpi(field: KPIField) {
    setEditingField(field);
    setFieldForm({
      field_name: field.field_name,
      field_label: field.field_label,
      field_type: field.field_type,
      min_target: field.min_target,
      flag_threshold: field.flag_threshold,
      flag_independent: field.flag_independent,
      is_active: field.is_active,
      dropdown_options: field.dropdown_options,
      is_required: field.is_required,
    });
    setDropdownInput('');
    setKpiDialogOpen(true);
  }

  function closeKpiDialog() {
    setKpiDialogOpen(false);
    setEditingField(null);
    setFieldForm(emptyField());
    setDropdownInput('');
  }

  function toggleDay(day: number) {
    setShift((prev) => {
      const days = prev.days_of_week ?? [];
      const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
      return { ...prev, days_of_week: next };
    });
    setShiftDirty(true);
  }

  const canSaveKpi =
    fieldForm.field_label.trim() &&
    (fieldForm.field_type !== 'dropdown' ||
      (fieldForm.dropdown_options && fieldForm.dropdown_options.length >= 2));

  if (isLoading) return <div className="flex items-center justify-center py-20"><LogoLoadingIndicator /></div>;
  if (!campaign) return <Navigate to="/campaigns" replace />;

  const clientName = campaign.clients?.name ?? '';
  const displayName = clientName ? `${clientName} › ${campaign.name}` : campaign.name;

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/campaigns')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {editingName ? (
            <div className="space-y-3">
              <Input
                placeholder="Campaign name"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                className="w-64"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveCampaignMutation.mutate()} disabled={!nameVal.trim() || saveCampaignMutation.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setNameVal(campaign.name); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
                <p className="text-muted-foreground mt-1">{agentCount} agent{agentCount !== 1 ? 's' : ''} assigned</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingName(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Team Lead:</Label>
            <Select
              value={campaign?.team_lead_id || "none"}
              onValueChange={(v) => saveTLMutation.mutate(v === "none" ? null : v)}
            >
              <SelectTrigger className="w-64 h-9">
                <SelectValue placeholder="Select TL..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {eligibleTLs.map((tl) => (
                  <SelectItem key={tl.id} value={tl.id}>
                    {tl.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Shift */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Days of week */}
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    (shift.days_of_week ?? []).includes(i)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={shift.start_time ?? '08:00'}
                onChange={(e) => { setShift((p) => ({ ...p, start_time: e.target.value })); setShiftDirty(true); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-time">End Time</Label>
              <Input
                id="end-time"
                type="time"
                value={shift.end_time ?? '17:00'}
                onChange={(e) => { setShift((p) => ({ ...p, end_time: e.target.value })); setShiftDirty(true); }}
              />
            </div>
          </div>

          {/* Grace period */}
          <div className="space-y-1.5 w-40">
            <Label htmlFor="grace">Grace Period (minutes)</Label>
            <Input
              id="grace"
              type="number"
              min="0"
              max="60"
              value={shift.grace_minutes ?? 10}
              onChange={(e) => { setShift((p) => ({ ...p, grace_minutes: parseInt(e.target.value) || 0 })); setShiftDirty(true); }}
            />
          </div>

          {shiftDirty && (
            <Button onClick={() => saveShiftMutation.mutate()} disabled={saveShiftMutation.isPending}>
              {saveShiftMutation.isPending ? 'Saving...' : 'Save Shift'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Assigned Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {assignedAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No agents assigned to this campaign yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{getDisplayName(agent)}</TableCell>
                    <TableCell>{agent.employee_id}</TableCell>
                    <TableCell>{agent.title ?? '-'}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove agent</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove {getDisplayName(agent)} from {campaign.name}? They can be reassigned later from their profile or from this page.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeAgentMutation.mutate(agent.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assign Employee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign Employee</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Employee</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {getDisplayName(emp)} ({emp.employee_id}){emp.campaign_id ? ' - currently assigned' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => { if (selectedEmployeeId) assignAgentMutation.mutate(selectedEmployeeId); }}
              disabled={!selectedEmployeeId || assignAgentMutation.isPending}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              {assignAgentMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </div>
          {availableEmployees.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              All active employees are already assigned to this campaign.
            </p>
          )}
        </CardContent>
      </Card>

      {/* EOD / KPI Fields */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">EOD Metrics & Daily Targets</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              What agents report at end of day and what targets they're measured against
            </p>
          </div>
          <Button size="sm" onClick={openAddKpi}>
            <Plus className="h-4 w-4 mr-1" />
            Add Metric
          </Button>
        </CardHeader>
        <CardContent>
          {kpiFields.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No metrics yet. Add one to define what agents report.
            </p>
          ) : (
            <div className="space-y-2">
              {kpiFields.map((field, idx) => (
                <div
                  key={field.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    field.is_active ? 'bg-background' : 'bg-muted/40 opacity-60'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0}
                      onClick={() => reorderKpiMutation.mutate({ fieldId: field.id, direction: 'up' })}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === kpiFields.length - 1}
                      onClick={() => reorderKpiMutation.mutate({ fieldId: field.id, direction: 'down' })}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{field.field_label}</span>
                      <Badge variant="outline" className="text-xs">{FIELD_TYPE_LABELS[field.field_type]}</Badge>
                      {field.is_required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                      {field.field_type === 'number' && field.min_target != null && (
                        <span className="text-xs text-muted-foreground">Goal: {field.min_target}/day</span>
                      )}
                      {field.field_type === 'number' && field.flag_threshold != null && (
                        <span className="text-xs text-amber-600">
                          Flag &lt; {field.flag_threshold}
                          {!field.flag_independent && (
                            <span className="text-muted-foreground"> (not independent)</span>
                          )}
                        </span>
                      )}
                      {field.field_type === 'dropdown' && field.dropdown_options && (
                        <span className="text-xs text-muted-foreground">{field.dropdown_options.length} options</span>
                      )}
                    </div>
                  </div>
                  <Switch checked={field.is_active}
                    onCheckedChange={(val) => toggleKpiMutation.mutate({ fieldId: field.id, is_active: val })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditKpi(field)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {(isOwner || isAdmin) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete "${field.field_label}"?`)) deleteKpiMutation.mutate(field.id); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Early Release (manager+ only) */}
      {isLeadership && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Early Release</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Allow agents on this campaign to clock out before shift end if they hit the campaign's metric target.
              Day still counts as a full shift for payroll. EOD submission is queued and batched with the rest of the team at end of day.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="early-release-switch" className="cursor-pointer">
                Enable Early Release
              </Label>
              <Switch
                id="early-release-switch"
                checked={earlyReleaseEnabled}
                onCheckedChange={(v) => { setEarlyReleaseEnabled(v); setEarlyReleaseDirty(true); }}
              />
            </div>
            {earlyReleaseEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="early-release-criteria">Criteria (shown to agent)</Label>
                <Input
                  id="early-release-criteria"
                  placeholder='e.g. "10 credit pulls" or "all tickets resolved, no open escalations"'
                  value={earlyReleaseCriteria}
                  onChange={(e) => { setEarlyReleaseCriteria(e.target.value); setEarlyReleaseDirty(true); }}
                />
                <p className="text-xs text-muted-foreground">
                  Plain language. Agents see this when they choose to leave early, and it's stored in the audit trail so the client report can be checked against the claim.
                </p>
              </div>
            )}
            {earlyReleaseDirty && (
              <Button
                onClick={() => saveEarlyReleaseMutation.mutate()}
                disabled={saveEarlyReleaseMutation.isPending || (earlyReleaseEnabled && !earlyReleaseCriteria.trim())}
              >
                {saveEarlyReleaseMutation.isPending ? 'Saving...' : 'Save Early Release'}
              </Button>
            )}
            {earlyReleaseDirty && earlyReleaseEnabled && !earlyReleaseCriteria.trim() && (
              <p className="text-xs text-amber-600">
                Add a criteria description before saving — agents need to know what they're claiming.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* EOD Digest Recipients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">EOD Digest Recipients</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Who receives the daily EOD summary email for this campaign
            </p>
          </div>
          <Button size="sm" onClick={openRecipientDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add Recipient
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="include-agents-toggle" className="cursor-pointer">
                Include campaign agents automatically
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, every active employee on this campaign (excluding system users) is added to the digest To: line on top of the manual recipients below. Lets clients use Reply All to reach the whole team.
              </p>
            </div>
            <Switch
              id="include-agents-toggle"
              checked={includeAgentsInDigest}
              disabled={toggleIncludeAgentsMutation.isPending}
              onCheckedChange={(v) => {
                setIncludeAgentsInDigest(v);
                toggleIncludeAgentsMutation.mutate(v);
              }}
            />
          </div>
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No recipients configured — digest will not send until at least one active recipient is added.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id} className={r.active ? '' : 'opacity-50'}>
                    <TableCell className="font-medium">{r.email}</TableCell>
                    <TableCell>{ROLE_LABELS[r.role_label] ?? r.role_label}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.active}
                        onCheckedChange={(val) =>
                          toggleRecipientActiveMutation.mutate({ recipientId: r.id, active: val })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete recipient</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove {r.email} from the digest? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRecipientMutation.mutate(r.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Recipient Dialog */}
      <Dialog open={recipientDialogOpen} onOpenChange={(open) => !open && closeRecipientDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Digest Recipient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={recipientEmail}
                onChange={(e) => { setRecipientEmail(e.target.value); setRecipientEmailError(''); }}
              />
              {recipientEmailError && (
                <p className="text-sm text-destructive">{recipientEmailError}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={recipientRole} onValueChange={setRecipientRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={recipientActive} onCheckedChange={setRecipientActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRecipientDialog}>Cancel</Button>
            <Button onClick={handleAddRecipient} disabled={addRecipientMutation.isPending}>
              {addRecipientMutation.isPending ? 'Adding...' : 'Add Recipient'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Digest Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digest Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Daily Digest Trigger</p>
            <p className="text-xs text-muted-foreground">
              Auto-fires 5 min after today's latest shift ends (shift end + grace + 5 min).
              Configure shifts on the <a href="/settings/shifts" className="underline">Shift Settings</a> page.
              No shifts today = no digest.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="digest-morning">Morning Bundle Time</Label>
            <Input
              id="digest-morning"
              type="time"
              value={digestMorningBundle}
              onChange={(e) => { setDigestMorningBundle(e.target.value); setDigestDirty(true); }}
            />
            <p className="text-xs text-muted-foreground">
              {digestMorningBundle
                ? 'Late & missing EODs from yesterday sent at this time.'
                : 'Empty = no morning bundle.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="digest-tz">Timezone</Label>
            <Select value={digestTimezone} onValueChange={(v) => { setDigestTimezone(v); setDigestDirty(true); }}>
              <SelectTrigger id="digest-tz" className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="digest-reply-to">Reply-To Email</Label>
            <Input
              id="digest-reply-to"
              type="email"
              placeholder="name@example.com"
              value={digestReplyTo}
              onChange={(e) => {
                setDigestReplyTo(e.target.value);
                setDigestReplyToError('');
                setDigestDirty(true);
              }}
            />
            <p className="text-xs text-muted-foreground">
              When clients or managers hit Reply on the digest, responses go to this address. Leave blank to use the sender address.
            </p>
            {digestReplyToError && (
              <p className="text-sm text-destructive">{digestReplyToError}</p>
            )}
          </div>
          {digestDirty && (
            <Button onClick={handleSaveDigest} disabled={saveDigestMutation.isPending}>
              {saveDigestMutation.isPending ? 'Saving...' : 'Save Schedule'}
            </Button>
          )}
          {(isLeadership || isTeamLead) && (
            <div className="space-y-2 pt-2 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="test-digest-email" className="text-xs">Send to (optional)</Label>
                  <Input
                    id="test-digest-email"
                    type="email"
                    placeholder="defaults to your login email"
                    value={testDigestEmail}
                    onChange={(e) => setTestDigestEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="test-digest-date" className="text-xs">Date (optional)</Label>
                  <Input
                    id="test-digest-date"
                    type="date"
                    value={testDigestDate}
                    onChange={(e) => setTestDigestDate(e.target.value)}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                disabled={sendingTestDigest}
                onClick={async () => {
                  setSendingTestDigest(true);
                  try {
                    const reqBody: Record<string, unknown> = { mode: 'test', campaign_id: id };
                    if (testDigestEmail.trim()) reqBody.test_to_email = testDigestEmail.trim();
                    if (testDigestDate) reqBody.date = testDigestDate;
                    const { data, error } = await supabase.functions.invoke('send-eod-digest', {
                      body: reqBody,
                    });
                    if (error) throw new Error(await edgeErrorMessage(error));
                    if (data?.error) throw new Error(data.error);
                    toast.success(
                      `Test digest sent to ${data.sent_to} for ${data.date} (${data.eod_count}/${data.agent_count} agents submitted)`,
                    );
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Failed to send test digest';
                    toast.error(msg);
                  } finally {
                    setSendingTestDigest(false);
                  }
                }}
              >
                {sendingTestDigest ? 'Sending...' : 'Send Test Digest'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sends a preview to the address above (or your login if blank) using the chosen date's data (or today's if blank). Real recipients are not contacted. Ignores DRY_RUN. Does not log to <code>eod_digest_log</code>, so fire it as often as you want.
              </p>
            </div>
          )}
          {(isLeadership || isTeamLead) && (
            <div className="space-y-1 pt-2 border-t">
              <Button
                variant="destructive"
                disabled={sendingManualDigest}
                onClick={async () => {
                  if (!window.confirm('This will send a real digest to all recipients. Continue?')) return;
                  setSendingManualDigest(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('send-eod-digest', {
                      body: { mode: 'manual_fire', campaign_id: id },
                    });
                    if (error) throw new Error(await edgeErrorMessage(error));
                    if (data?.error) throw new Error(data.error);
                    if (data?.status === 'already_sent_today') {
                      toast.info('Digest was already sent today for this campaign.');
                    } else if (data?.status === 'sent' || data?.status === 'dry_run') {
                      toast.success(`Digest sent to ${data.dryRun ? '(dry run) ' : ''}${data.campaign}`);
                    } else if (data?.status === 'no_recipients') {
                      toast.info('No active recipients configured for this campaign.');
                    } else {
                      toast.success('Digest fired.');
                    }
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Failed to send digest';
                    toast.error(msg);
                  } finally {
                    setSendingManualDigest(false);
                  }
                }}
              >
                {sendingManualDigest ? 'Sending...' : 'Send Digest Now'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Fires the real daily digest to all active recipients immediately. Use on days the team wrapped early or if the auto-trigger missed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holiday Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holiday Coverage</CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enables the cap/request system and client notification emails for this campaign.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="holiday-coverage-switch" className="cursor-pointer">
              Requires Holiday Coverage
            </Label>
            <Switch
              id="holiday-coverage-switch"
              checked={campaign?.requires_holiday_coverage ?? false}
              onCheckedChange={(val) => holidayCoverageMutation.mutate(val)}
              disabled={holidayCoverageMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI field dialog */}
      <Dialog open={kpiDialogOpen} onOpenChange={(open) => !open && closeKpiDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit Metric' : 'Add Metric'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Question / Label</Label>
              <Input placeholder="e.g. Calls Handled" value={fieldForm.field_label}
                onChange={(e) => setFieldForm((p) => ({ ...p, field_label: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Field Type</Label>
              <Select value={fieldForm.field_type}
                onValueChange={(v) => setFieldForm((p) => ({ ...p, field_type: v as FieldType, min_target: null, dropdown_options: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldForm.field_type === 'number' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Daily Goal (shown to agents)</Label>
                  <Input type="number" min="0" placeholder="e.g. 7"
                    value={fieldForm.min_target ?? ''}
                    onChange={(e) => setFieldForm((p) => ({ ...p, min_target: e.target.value === '' ? null : Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Flag Below (TL alert threshold)</Label>
                  <Input type="number" min="0" placeholder="e.g. 4"
                    value={fieldForm.flag_threshold ?? ''}
                    onChange={(e) => setFieldForm((p) => ({ ...p, flag_threshold: e.target.value === '' ? null : Number(e.target.value) }))} />
                </div>
              </div>
            )}
            {fieldForm.field_type === 'number' && fieldForm.flag_threshold != null && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Triggers flag independently</Label>
                  <p className="text-xs text-muted-foreground">
                    Off = this field alone won't raise a flag. Useful for effort metrics
                    (e.g. calls made) where high output on another KPI should override a low count.
                  </p>
                </div>
                <Switch
                  checked={fieldForm.flag_independent}
                  onCheckedChange={(v) => setFieldForm((p) => ({ ...p, flag_independent: v }))}
                />
              </div>
            )}
            {fieldForm.field_type === 'dropdown' && (
              <div className="space-y-1.5">
                <Label>Options (min. 2)</Label>
                <div className="flex gap-2">
                  <Input placeholder="Add option..." value={dropdownInput}
                    onChange={(e) => setDropdownInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = dropdownInput.trim();
                        if (val) { setFieldForm((p) => ({ ...p, dropdown_options: [...(p.dropdown_options ?? []), val] })); setDropdownInput(''); }
                      }
                    }} />
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => { const val = dropdownInput.trim(); if (val) { setFieldForm((p) => ({ ...p, dropdown_options: [...(p.dropdown_options ?? []), val] })); setDropdownInput(''); } }}>
                    Add
                  </Button>
                </div>
                {fieldForm.dropdown_options && fieldForm.dropdown_options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {fieldForm.dropdown_options.map((opt) => (
                      <Badge key={opt} variant="secondary" className="gap-1 pr-1">
                        {opt}
                        <button onClick={() => setFieldForm((p) => ({ ...p, dropdown_options: (p.dropdown_options ?? []).filter((o) => o !== opt) }))}
                          className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch checked={fieldForm.is_required}
                onCheckedChange={(v) => setFieldForm((p) => ({ ...p, is_required: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={fieldForm.is_active}
                onCheckedChange={(v) => setFieldForm((p) => ({ ...p, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeKpiDialog}>Cancel</Button>
            <Button onClick={() => saveKpiMutation.mutate()} disabled={!canSaveKpi || saveKpiMutation.isPending}>
              {saveKpiMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
