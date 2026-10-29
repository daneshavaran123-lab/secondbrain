import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api";

// Members and invitations go through /org-members: /db shows a person only their own rows
async function call(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await apiFetch(path, init);
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: body.data } : { ok: false, error: body.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
import { OrganizationMember, OrganizationInvitation, OrganizationRole } from "@/types/organization";
import { toast } from "sonner";
import { organizationNotificationService } from "./organizationNotificationService";

class OrganizationMemberService {
  /**
   * دعوت عضو جدید
   */
  async inviteMember(
    organizationId: string,
    email: string,
    role: OrganizationRole = 'member'
  ): Promise<OrganizationInvitation | null> {
    try {
      // ایجاد دعوتنامه
      const { data: invitation, error } = await supabase
        .from('organization_invitations')
        .insert({
          organization_id: organizationId,
          email,
          role,
          invited_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select(`
          *,
          organizations:organization_id(name, description, logo_url)
        `)
        .single();

      if (error) {
        if (error.code === '23505') { // unique constraint violation
          toast.error('دعوتنامه قبلاً ارسال شده است');
        } else {
          throw error;
        }
        return null;
      }

      // ارسال اعلان
      await organizationNotificationService.notifyAllMembers(
        organizationId,
        'invitation_sent',
        'دعوتنامه جدید',
        `دعوتنامه‌ای برای ${email} ارسال شد`,
        { email, role }
      );

      toast.success('دعوتنامه با موفقیت ارسال شد');
      return invitation as OrganizationInvitation;
    } catch (error) {
      console.error('Error inviting member:', error);
      toast.error('خطا در ارسال دعوتنامه');
      return null;
    }
  }

  /**
   * لغو دعوتنامه
   */
  async cancelInvitation(invitationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
      toast.success('دعوتنامه لغو شد');
      return true;
    } catch (error) {
      console.error('Error canceling invitation:', error);
      toast.error('خطا در لغو دعوتنامه');
      return false;
    }
  }

  /**
   * پذیرش دعوتنامه
   */
  async acceptInvitation(token: string): Promise<boolean> {
    const res = await call(`/org-members/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' });
    if (!res.ok) {
      toast.error(res.error || 'دعوتنامه پذیرفته نشد');
      return false;
    }
    toast.success('با موفقیت به سازمان پیوستید');
    return true;
  }

  /**
   * رد دعوتنامه
   */
  async rejectInvitation(token: string): Promise<boolean> {
    const res = await call(`/org-members/invitations/${encodeURIComponent(token)}/reject`, { method: 'POST' });
    if (!res.ok) {
      toast.error(res.error || 'دعوتنامه رد نشد');
      return false;
    }
    toast.success('دعوتنامه رد شد');
    return true;
  }

  /**
   * دریافت اعضای سازمان
   */
  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    const res = await call(`/org-members/${organizationId}/members`);
    if (!res.ok) {
      console.error('Error getting members:', res.error);
      return [];
    }
    return res.data as OrganizationMember[];
  }

  /**
   * تغییر نقش عضو
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    newRole: OrganizationRole
  ): Promise<boolean> {
    const res = await call(`/org-members/${organizationId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
    if (!res.ok) {
      toast.error(res.error || 'نقش عضو تغییر نکرد');
      return false;
    }
    await organizationNotificationService.createNotification(
      organizationId,
      userId,
      'role_changed',
      'تغییر نقش',
      `نقش شما تغییر یافت`,
      { new_role: newRole }
    ).catch(() => undefined);
    toast.success('نقش عضو با موفقیت تغییر یافت');
    return true;
  }

  /**
   * حذف عضو
   */
  async removeMember(organizationId: string, userId: string): Promise<boolean> {
    const res = await call(`/org-members/${organizationId}/members/${userId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error(res.error || 'عضو حذف نشد');
      return false;
    }
    toast.success('عضو با موفقیت حذف شد');
    return true;
  }

  /**
   * دریافت دعوتنامه‌های pending
   */
  async getPendingInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    try {
      const { data, error } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // دریافت اطلاعات inviter
      const invitationsWithInviter = await Promise.all(
        (data || []).map(async (inv) => {
          const { data: inviter } = await supabase
            .from('profiles')
            .select('email, display_name')
            .eq('id', inv.invited_by)
            .single();
          
          return {
            ...inv,
            inviter: inviter || undefined,
          };
        })
      );
      
      return invitationsWithInviter as unknown as OrganizationInvitation[];
    } catch (error) {
      console.error('Error getting pending invitations:', error);
      return [];
    }
  }

  /**
   * دریافت دعوتنامه با token
   */
  async getInvitationByToken(token: string): Promise<OrganizationInvitation | null> {
    const res = await call(`/org-members/invitations/${encodeURIComponent(token)}`);
    return res.ok ? (res.data as OrganizationInvitation) : null;
  }

  /**
   * بررسی نقش کاربر در سازمان
   */
  async getUserRole(organizationId: string, userId: string): Promise<OrganizationRole | null> {
    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return (data?.role as OrganizationRole) || null;
    } catch (error) {
      console.error('Error getting user role:', error);
      return null;
    }
  }

  /**
   * بررسی دسترسی کاربر
   */
  async canUserPerformAction(
    organizationId: string,
    userId: string,
    requiredRole: OrganizationRole
  ): Promise<boolean> {
    const userRole = await this.getUserRole(organizationId, userId);
    if (!userRole) return false;

    const roleHierarchy: Record<OrganizationRole, number> = {
      owner: 1,
      admin: 2,
      manager: 3,
      member: 4,
      viewer: 5,
    };

    return roleHierarchy[userRole] <= roleHierarchy[requiredRole];
  }
}

export const organizationMemberService = new OrganizationMemberService();
