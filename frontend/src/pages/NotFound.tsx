import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6" dir="rtl">
      <div className="max-w-sm text-center">
        <Compass className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-bold">این صفحه پیدا نشد</h1>
        <p className="mt-2 text-muted-foreground">
          نشانی <span className="latin-digits break-all font-mono text-sm" dir="ltr">{location.pathname}</span> در مغز دوم وجود ندارد؛ شاید جابه‌جا شده یا اشتباه تایپ شده است.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild><Link to="/">رفتن به داشبورد</Link></Button>
          <Button variant="outline" onClick={() => window.history.back()}>بازگشت</Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
