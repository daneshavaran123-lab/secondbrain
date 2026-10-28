import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextInputWithVoice } from "@/components/ui/text-input-with-voice";
import { Calendar } from "@/components/ui/calendar";
import { Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { format as formatJalali, isSameMonth } from "date-fns-jalali";
import { SectionHeader } from "@/components/ui/section-header";
import GratitudeQuoteDisplay from "@/components/gratitude/GratitudeQuoteDisplay";
import { Session } from "@supabase/supabase-js";
import { gratitudeLocalService } from "@/services/gratitudeLocalService";
import { enhancedGratitudeService } from "@/services/enhancedGratitudeService";

interface GratitudeEntry {
  id: string;
  date: string;
  content: string;
  mood?: string;
  tags?: string[];
  created_at: string;
}

const GratitudeJournalPage = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [todayEntry, setTodayEntry] = useState<GratitudeEntry | null>(null);
  const [gratitudeContent, setGratitudeContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const { toast } = useToast();

  const fetchEntries = async () => {
    try {
      if (session?.user) {
        // Fetch from enhanced service for authenticated users
        const data = await enhancedGratitudeService.getAllEntries(session.user.id);
        setEntries(data);
        
        // Find today's entry
        const today = format(new Date(), 'yyyy-MM-dd');
        const todayData = await enhancedGratitudeService.getEntryForDate(today, session.user.id);
        setTodayEntry(todayData || null);
        
        if (todayData) {
          setGratitudeContent(todayData.content || "");
        }
      } else {
        // Load from local storage for non-authenticated users
        const localEntries = gratitudeLocalService.getAll();
        setEntries(localEntries as any);
        
        // Find today's entry
        const today = format(new Date(), 'yyyy-MM-dd');
        const todayData = gratitudeLocalService.getForDate(today);
        setTodayEntry(todayData as any || null);
        
        if (todayData) {
          setGratitudeContent(todayData.gratitude_item_1 || "");
        }
      }
    } catch (error: any) {
      console.error('Error fetching gratitude entries:', error);
      toast({
        title: "خطا",
        description: `امکان بارگیری ورودی‌های شکرگذاری وجود ندارد: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const saveGratitudeEntry = async () => {
    if (!gratitudeContent.trim()) {
      toast({
        title: "خطا",
        description: "لطفاً مورد شکرگذاری خود را وارد کنید",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      if (session?.user) {
        // Save using enhanced service for authenticated users
        await enhancedGratitudeService.saveEntry(
          today,
          gratitudeContent.trim(),
          undefined,
          [],
          [],
          [],
          session.user.id,
          todayEntry?.id
        );

        toast({
          title: "ذخیره شد",
          description: "شکرگذاری امروز شما با موفقیت ثبت شد",
        });
      } else {
        // Save to local storage for non-authenticated users
        gratitudeLocalService.upsertForDate(today, { gratitude_item_1: gratitudeContent.trim() }, [], []);
        
        toast({
          title: "ذخیره شد",
          description: "شکرگذاری امروز شما روی این دستگاه ذخیره شد",
        });
      }

      fetchEntries();
    } catch (error: any) {
      console.error('Error saving gratitude entry:', error);
      toast({
        title: "خطا",
        description: `امکان ذخیره شکرگذاری وجود ندارد: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      // Always fetch entries regardless of auth status
      fetchEntries();
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        // Always fetch entries when auth state changes
        setTimeout(() => {
          fetchEntries();
        }, 0);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Realtime subscription for gratitude entries - auto-refresh when assistant saves
  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase
      .channel('gratitude-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gratitude_entries',
          filter: `user_id=eq.${session.user.id}`
        },
        (payload) => {
          console.log('[Gratitude] Realtime update:', payload);
          fetchEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  // Fallback polling every 10 seconds for guaranteed updates
  useEffect(() => {
    if (!session?.user) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchEntries();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [session?.user?.id]);

  const selectedDateEntry = entries.find(
    entry => entry.date === format(selectedDate, 'yyyy-MM-dd')
  );

  const entriesWithData = entries.filter(entry => entry.date);
  const datesWithEntries = entriesWithData.map(entry => parseISO(entry.date));
  const now = new Date();
  const stats = [
    { label: 'کل روزهای ثبت‌شده', value: entriesWithData.length },
    { label: `در ${formatJalali(now, 'MMMM')}`, value: datesWithEntries.filter(d => isSameMonth(d, now)).length },
    { label: 'هفت روز گذشته', value: datesWithEntries.filter(d => now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000).length },
  ];
  const longDate = (date: Date) => formatJalali(date, 'EEEE d MMMM yyyy');

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <SectionHeader
          title="دفتر شکرگذاری"
          subtitle="هر روز، سه چیز که بابتشان شکرگذارم"
          icon={<Heart />}
          className="mb-0 md:mb-0"
        />

        <GratitudeQuoteDisplay />

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {stats.map(item => (
            <div key={item.label} className="bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-2xl font-medium leading-8">{item.value.toLocaleString('fa-IR')}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
          <section className="rounded-lg border border-border bg-card p-5 md:p-6" aria-labelledby="today-heading">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="today-heading" className="text-lg font-semibold">شکرگذاری امروز</h2>
              <span className="text-sm text-muted-foreground">{longDate(now)}</span>
            </div>
            <div className="space-y-4">
              <TextInputWithVoice
                id="content"
                value={gratitudeContent}
                onChange={setGratitudeContent}
                type="textarea"
                placeholder="امروز بابت چه چیزی شکرگذارم…"
                rows={8}
                enableVoice={true}
                label="چه چیزهایی امروز را خوب کرد؟"
              />
              <Button onClick={saveGratitudeEntry} disabled={isLoading || !gratitudeContent.trim()} className="w-full sm:w-auto">
                {isLoading ? "در حال ذخیره…" : todayEntry ? "به‌روزرسانی" : "ثبت شکرگذاری"}
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-2 lg:w-[19rem]" aria-labelledby="calendar-heading">
            <h2 id="calendar-heading" className="px-3 pt-3 text-sm font-medium text-muted-foreground">روزهای ثبت‌شده</h2>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              modifiers={{ hasEntry: datesWithEntries }}
              modifiersClassNames={{
                hasEntry: "relative font-semibold after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-signal",
              }}
              className="mx-auto w-fit"
            />
            <div className="border-t border-border px-3 py-3 text-sm">
              <div className="text-muted-foreground">{longDate(selectedDate)}</div>
              <p className="mt-1 leading-7">{selectedDateEntry ? selectedDateEntry.content : 'برای این روز چیزی ثبت نشده است.'}</p>
            </div>
          </section>
        </div>

        {entries.length > 0 && (
          <section className="rounded-lg border border-border bg-card" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="border-b border-border px-5 py-3 text-base font-semibold">شکرگذاری‌های اخیر</h2>
            <ul className="divide-y divide-border">
              {entries.slice(0, 5).map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <div className="text-xs text-muted-foreground">{longDate(parseISO(entry.date))}</div>
                  <p className="mt-1 text-sm leading-7">{entry.content}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default GratitudeJournalPage;