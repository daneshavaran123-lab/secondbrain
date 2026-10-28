import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ListEmptyProps {
  icon: LucideIcon;
  /** Whether anything has been recorded at all (then it is the search or filter that hides it) */
  hasItems: boolean;
  firstTitle: string;
  firstHint: string;
  addLabel: string;
  onAdd: () => void;
  onClearFilters?: () => void;
}

/** Empty list: an invitation to add the first item, or — when filters hide everything — a way back. */
export function ListEmpty({ icon: Icon, hasItems, firstTitle, firstHint, addLabel, onAdd, onClearFilters }: ListEmptyProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Icon className="h-10 w-10 text-muted-foreground" aria-hidden />
        <h3 className="text-lg font-semibold">{hasItems ? 'موردی با این جستجو پیدا نشد' : firstTitle}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{hasItems ? 'عبارت جستجو یا فیلترها را تغییر دهید.' : firstHint}</p>
        {hasItems
          ? onClearFilters && <Button variant="outline" onClick={onClearFilters}>پاک کردن جستجو و فیلترها</Button>
          : <Button onClick={onAdd} className="gap-2"><Plus className="h-4 w-4" />{addLabel}</Button>}
      </CardContent>
    </Card>
  );
}
