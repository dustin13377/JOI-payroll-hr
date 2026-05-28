import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Building2, Plus, ChevronRight, ChevronDown, Users, Clock, Pencil, Trash2, ArrowLeft, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useUserProfile } from '@/hooks/useUserProfile';

interface Campaign {
  id: string;
  client_id: string;
  name: string;
  is_active: boolean;
  agentCount: number;
  shiftName: string | null;
}

interface ClientWithCampaigns {
  id: string;
  name: string;
  prefix: string;
  is_active: boolean;
  campaigns: Campaign[];
  totalAgents: number;
}

export default function Campaigns() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // organization_id is NOT NULL on both clients and campaigns with no DB
  // default, and the RLS WITH CHECK requires (organization_id = my_org_id()).
  // Missing it silently fails with "new row violates row-level security policy".
  // See audit finding H-2.
  const { organizationId } = useUserProfile();

  // Dialog state
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<{ id: string; name: string; prefix: string } | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<{ id: string; name: string } | null>(null);
  const [targetClientId, setTargetClientId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrefix, setNewPrefix] = useState('');

  // Expanded client
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  // Show soft-deleted clients + campaigns so they can be reactivated.
  const [showInactive, setShowInactive] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['clients-with-campaigns'] });
  };

  const { data: clientsWithCampaigns = [], isLoading } = useQuery({
    queryKey: ['clients-with-campaigns', showInactive],
    queryFn: async () => {
      // Fetch active + inactive in one shot when showInactive is true; the UI
      // greys out inactives. When false we apply is_active=true filters to
      // keep the active list lean.
      const clientsQuery = supabase.from('clients').select('id, name, prefix, is_active').order('name');
      const campaignsQuery = supabase.from('campaigns').select('id, client_id, name, is_active').order('name');
      const [{ data: clients }, { data: campaigns }, { data: employees }, { data: shifts }] =
        await Promise.all([
          showInactive ? clientsQuery : clientsQuery.eq('is_active', true),
          showInactive ? campaignsQuery : campaignsQuery.eq('is_active', true),
          supabase.from('employees').select('campaign_id').eq('is_active', true).eq('is_system_user', false),
          supabase.from('shift_settings').select('campaign_id, shift_name'),
        ]);

      return (clients ?? []).map((cl) => {
        const myCampaigns = (campaigns ?? [])
          .filter((c) => c.client_id === cl.id)
          .map((c) => ({
            ...c,
            agentCount: (employees ?? []).filter((e) => e.campaign_id === c.id).length,
            shiftName: (shifts ?? []).find((s) => s.campaign_id === c.id)?.shift_name ?? null,
          }));
        return {
          ...cl,
          campaigns: myCampaigns,
          totalAgents: myCampaigns.reduce((sum, c) => sum + c.agentCount, 0),
        };
      }) as ClientWithCampaigns[];
    },
  });

  // Reactivate mutations — flip is_active back to true.
  const reactivateClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').update({ is_active: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Client reactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').update({ is_active: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Campaign reactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Client CRUD
  const saveClientMutation = useMutation({
    mutationFn: async () => {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update({ name: newName.trim(), prefix: newPrefix.trim().toUpperCase() })
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        if (!organizationId) throw new Error('Cannot create client: your profile has no organization. Refresh and try again.');
        const { error } = await supabase
          .from('clients')
          .insert({
            name: newName.trim(),
            prefix: newPrefix.trim().toUpperCase(),
            organization_id: organizationId,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setClientDialogOpen(false);
      toast.success(editingClient ? 'Client updated' : 'Client created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete — preserves campaigns, employees, invoices, payroll
      // tied to this client. Hidden from the active list, reactivatable
      // via the "Show inactive" toggle.
      const { error } = await supabase.from('clients').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Client deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Campaign CRUD
  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      if (editingCampaign) {
        const { error } = await supabase
          .from('campaigns')
          .update({ name: newName.trim() })
          .eq('id', editingCampaign.id);
        if (error) throw error;
      } else {
        if (!organizationId) throw new Error('Cannot create campaign: your profile has no organization. Refresh and try again.');
        const { error } = await supabase
          .from('campaigns')
          .insert({
            client_id: targetClientId,
            name: newName.trim(),
            organization_id: organizationId,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setCampaignDialogOpen(false);
      toast.success(editingCampaign ? 'Campaign updated' : 'Campaign created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete — keeps eod_logs, payroll_records, agent_reviews etc.
      // intact for audit. The campaign drops out of all UI pickers.
      const { error } = await supabase.from('campaigns').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Campaign deactivated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openAddClient() {
    setEditingClient(null);
    setNewName('');
    setNewPrefix('');
    setClientDialogOpen(true);
  }

  function openEditClient(cl: { id: string; name: string; prefix: string }) {
    setEditingClient(cl);
    setNewName(cl.name);
    setNewPrefix(cl.prefix);
    setClientDialogOpen(true);
  }

  function openAddCampaign(clientId: string) {
    setEditingCampaign(null);
    setTargetClientId(clientId);
    setNewName('');
    setCampaignDialogOpen(true);
  }

  function openEditCampaign(camp: { id: string; name: string }) {
    setEditingCampaign(camp);
    setNewName(camp.name);
    setCampaignDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Manage clients and their campaigns — shifts, KPIs, and EOD questions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Show inactive
            </Label>
          </div>
          <Button onClick={openAddClient}>
            <Plus className="h-4 w-4 mr-1" />
            Add Client
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LogoLoadingIndicator size="sm" />
      ) : clientsWithCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No clients yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {clientsWithCampaigns.map((cl) => {
            const isExpanded = expandedClient === cl.id;
            return (
              <Card key={cl.id} className={cl.is_active === false ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <button
                      className="flex items-center gap-3 text-left flex-1"
                      onClick={() => setExpandedClient(isExpanded ? null : cl.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div>
                        <CardTitle className="text-lg">
                          {cl.name}
                          {cl.is_active === false && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {cl.prefix} · {cl.campaigns.length} campaign{cl.campaigns.length !== 1 ? 's' : ''} · {cl.totalAgents} agent{cl.totalAgents !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditClient(cl)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {cl.is_active === false ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reactivate client"
                          onClick={() => reactivateClientMutation.mutate(cl.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (cl.campaigns.filter((c) => c.is_active !== false).length > 0) {
                              toast.error('Deactivate all campaigns first');
                              return;
                            }
                            if (confirm(`Deactivate client "${cl.name}"? It will be hidden from the list. All historical data is preserved and you can bring it back via the "Show inactive" toggle.`)) {
                              deleteClientMutation.mutate(cl.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-2">
                    {cl.campaigns.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No campaigns yet.
                      </p>
                    ) : (
                      cl.campaigns.map((camp) => (
                        <div
                          key={camp.id}
                          className={`flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 transition-colors ${camp.is_active === false ? 'opacity-60' : ''}`}
                        >
                          <button
                            className="flex-1 text-left flex items-center gap-3"
                            onClick={() => navigate(`/campaigns/${camp.id}`)}
                          >
                            <div>
                              <span className="font-medium text-sm">
                                {camp.name}
                                {camp.is_active === false && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
                              </span>
                              <div className="flex gap-2 mt-1">
                                <Badge variant="outline" className="gap-1 text-xs">
                                  <Users className="h-3 w-3" />
                                  {camp.agentCount}
                                </Badge>
                                {camp.shiftName && (
                                  <Badge variant="outline" className="gap-1 text-xs">
                                    <Clock className="h-3 w-3" />
                                    {camp.shiftName}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCampaign(camp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {camp.is_active === false ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Reactivate campaign"
                                onClick={() => reactivateCampaignMutation.mutate(camp.id)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (camp.agentCount > 0) {
                                    toast.error('Reassign active agents first');
                                    return;
                                  }
                                  if (confirm(`Deactivate campaign "${camp.name}"? It will be hidden from the list but all historical data (EOD logs, payroll, reviews) is preserved.`)) {
                                    deleteCampaignMutation.mutate(camp.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => openAddCampaign(cl.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Campaign
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Client dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={(open) => !open && setClientDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'New Client'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                placeholder="e.g. Torro"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-prefix">Prefix</Label>
              <Input
                id="client-prefix"
                placeholder="e.g. TORRO"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || !newPrefix.trim() || saveClientMutation.isPending}
              onClick={() => saveClientMutation.mutate()}
            >
              {saveClientMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign dialog */}
      <Dialog open={campaignDialogOpen} onOpenChange={(open) => !open && setCampaignDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Campaign Name</Label>
              <Input
                id="camp-name"
                placeholder="e.g. SLOC Weekday"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || saveCampaignMutation.isPending}
              onClick={() => saveCampaignMutation.mutate()}
            >
              {saveCampaignMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
