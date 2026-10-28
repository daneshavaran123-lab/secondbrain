import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

export function PersonalInfoSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    bio: "",
    avatar_url: ""
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  // The person's profile row (user_profiles, one per person); the name may only be in first/last name
  const loadProfile = async () => {
    try {
      const { data, error } = await supabase.from('user_profiles').select('*').maybeSingle();
      if (error) throw error;
      if (data) {
        setFormData({
          full_name: data.full_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || data.display_name || "",
          bio: data.bio || "",
          avatar_url: data.avatar_url || ""
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const saveProfile = async (fields: Record<string, unknown>) => {
    const { data, error } = await supabase.from('user_profiles').update(fields).select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      const inserted = await supabase.from('user_profiles').insert(fields);
      if (inserted.error) throw inserted.error;
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setUploading(true);

      // آپلود فایل
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // دریافت URL عمومی
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // به‌روزرسانی پروفایل
      await saveProfile({ avatar_url: publicUrl });

      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
      toast.success('تصویر پروفایل با موفقیت به‌روزرسانی شد');
    } catch (error: any) {
      toast.error('خطا در آپلود تصویر: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);

      const name = formData.full_name.trim();
      const [first, ...rest] = name.split(/\s+/);
      await saveProfile({ full_name: name, first_name: first || null, last_name: rest.join(' ') || null, bio: formData.bio });

      toast.success('اطلاعات با موفقیت به‌روزرسانی شد');
    } catch (error: any) {
      toast.error('خطا در به‌روزرسانی: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>اطلاعات شخصی</CardTitle>
        <CardDescription>
          اطلاعات خود را مشاهده و ویرایش کنید
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-6">
            <Avatar className="w-24 h-24">
              <AvatarImage src={formData.avatar_url} />
              <AvatarFallback>
                {formData.full_name?.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors">
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>تغییر تصویر</span>
                </div>
              </Label>
              <Input
                id="avatar"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">نام و نام خانوادگی</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="نام کامل خود را وارد کنید"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">ایمیل</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">ایمیل قابل تغییر نیست</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">بیوگرافی</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="درباره خود بنویسید…"
              rows={4}
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            ذخیره تغییرات
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
