import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Mic, Usb, Watch } from "lucide-react";
import { formatDistanceToNow } from "date-fns-jalali";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { healthDataService, SOURCE_LABEL } from "@/services/healthDataService";
import { plaudService } from "@/services/plaudService";
import { hiDockService } from "@/services/hiDockService";
import { cn } from "@/lib/utils";

// The devices the app can really talk to, each with what it brings and whether it is connected.
// (This page used to list sample devices as if they were connected.)

type Status = { connected: boolean; detail: string } | null;

const faDigits = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
const ago = (iso: string) => faDigits(formatDistanceToNow(new Date(iso), { addSuffix: true }));

const DEVICES = [
  {
    id: "health",
    name: "ساعت هوشمند و برنامه سلامت",
    examples: "اپل واچ و آیفون، ساعت‌ها و گوشی‌های اندرویدی (Health Connect)",
    brings: ["قدم‌ها", "خواب", "ضربان قلب", "وزن", "فعالیت"],
    icon: Watch,
    to: "/health?tab=devices",
  },
  {
    id: "plaud",
    name: "ضبط‌کننده Plaud",
    examples: "Plaud Note و NotePin",
    brings: ["ضبط جلسه", "متن گفتگو", "خلاصه", "اقدام‌ها"],
    icon: Mic,
    to: "/plaud",
  },
  {
    id: "hidock",
    name: "داک HiDock",
    examples: "HiDock H1",
    brings: ["ضبط تماس و جلسه", "متن گفتگو", "خلاصه"],
    icon: Usb,
    to: "/hi-dock",
  },
] as const;

const GadgetsPage = () => {
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    const settle = (id: string, p: Promise<Status>) =>
      p.catch(() => ({ connected: false, detail: "وضعیت خوانده نشد" }))
        .then((s) => setStatus((prev) => ({ ...prev, [id]: s })));

    settle("health", healthDataService.summary(30).then((s) => {
      const latest = [...s.sources].sort((a, b) => b.last_sync.localeCompare(a.last_sync))[0];
      return latest
        ? { connected: true, detail: `${SOURCE_LABEL[latest.source]}، آخرین داده ${ago(latest.last_sync)}` }
        : { connected: false, detail: "هنوز داده‌ای نرسیده" };
    }));
    settle("plaud", plaudService.getConnection().then((c) =>
      c ? { connected: true, detail: c.last_sync_at ? `آخرین همگام‌سازی ${ago(c.last_sync_at)}` : "متصل" } : { connected: false, detail: "متصل نیست" }));
    settle("hidock", hiDockService.getConnection().then((c) =>
      c ? { connected: true, detail: c.last_import_at ? `${c.device_name}، آخرین انتقال ${ago(c.last_import_at)}` : c.device_name } : { connected: false, detail: "متصل نیست" }));
  }, []);

  return (
    <div className="space-y-6 p-3 md:p-6">
      <SectionHeader
        title="دستگاه‌های هوشمند"
        subtitle="دستگاه‌هایی که می‌توانند داده‌هایشان را به مغز دوم شما بفرستند"
        icon={<Watch className="h-6 w-6" />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DEVICES.map((d) => {
          const s = status[d.id];
          return (
            <Card key={d.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <d.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{d.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{d.examples}</p>
                  </div>
                  {s === undefined ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <Badge variant="outline" className={cn("shrink-0", s?.connected ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300" : "text-muted-foreground")}>
                      {s?.connected ? "متصل" : "وصل نشده"}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {d.brings.map((b) => <Badge key={b} variant="secondary" className="font-normal">{b}</Badge>)}
                </div>

                <p className="min-h-5 text-sm text-muted-foreground">{s?.detail ?? ""}</p>

                <Button asChild variant={s?.connected ? "outline" : "default"} className="mt-auto justify-between">
                  <Link to={d.to}>
                    {s?.connected ? "مدیریت و داده‌ها" : "راه‌اندازی اتصال"}
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        داده هر دستگاه فقط در حساب خودتان نگه داشته می‌شود و دستیار وقتی از او بپرسید از آن استفاده می‌کند؛ مثلاً «خوابم این هفته چطور بود؟».
      </p>
    </div>
  );
};

export default GadgetsPage;
