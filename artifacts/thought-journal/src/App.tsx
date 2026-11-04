import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetJournalSummaryQueryKey, getGetThoughtQueryKey, getListCategoriesQueryKey,
  getListJournalDaysQueryKey, getListThoughtLinksQueryKey, getListThoughtsQueryKey,
  useCreateCategory, useCreateThought, useCreateThoughtLink, useDeleteThought,
  useDeleteThoughtLink, useGetJournalSummary, useGetThought, useListCategories,
  useListJournalDays, useListThoughtLinks, useListThoughts, useReviewThought,
  useUpdateThought,
} from '@workspace/api-client-react';
import type { Category, Thought, ThoughtLink } from '@workspace/api-client-react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import {
  Archive, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, CornerDownRight, Feather,
  GitBranch, Layers3, LoaderCircle, Plus, RefreshCw, RotateCcw, Trash2, X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const dayISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => dayISO(new Date());
const monthISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const tzOffset = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`).getTimezoneOffset();
const friendlyDate = (day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Intl.DateTimeFormat(undefined, options).format(day.length > 10 ? new Date(day) : new Date(`${day}T12:00:00`));
const shortTime = (value: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const localDateTime = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function invalidateDay(client: ReturnType<typeof useQueryClient>, date: string) {
  void client.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
  void client.invalidateQueries({ queryKey: getListThoughtLinksQueryKey({ date, timezoneOffsetMinutes: tzOffset(date) }) });
  void client.invalidateQueries({ queryKey: getGetJournalSummaryQueryKey({ date, timezoneOffsetMinutes: tzOffset(date) }) });
  void client.invalidateQueries({ queryKey: getListJournalDaysQueryKey() });
  void client.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
}
function invalidateThoughtLists(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
  void client.invalidateQueries({ queryKey: getGetJournalSummaryQueryKey() });
  void client.invalidateQueries({ queryKey: getListJournalDaysQueryKey() });
}

function Shell({ children, section }: { children: ReactNode; section: string }) {
  const [path] = useLocation();
  const nav = [
    { href: '/', label: 'Today’s map', icon: GitBranch },
    { href: '/review', label: 'Revisit', icon: RotateCcw },
    { href: '/archive', label: 'Past maps', icon: Archive },
  ];
  return <div className="min-h-[100dvh] bg-background text-foreground">
    <div className="mx-auto flex min-h-[100dvh] max-w-[1600px]">
      <aside className="hidden w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-7 md:flex">
        <Link href="/" className="mb-12 flex items-center gap-3 px-2 text-foreground no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><GitBranch size={19} /></span>
          <span><span className="serif block text-[22px] leading-none">Fieldnotes</span><span className="map-kicker mt-1 block text-[9px] text-muted-foreground">thought maps</span></span>
        </Link>
        <div className="map-kicker mb-3 px-3 text-[9px] text-muted-foreground">Your thinking space</div>
        <nav aria-label="Main navigation" className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-nav-${href === '/' ? 'today' : href.slice(1)}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium no-underline transition-colors ${path === href ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'}`}>
            <Icon size={17} strokeWidth={1.8} />{label}{path === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
          </Link>)}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-background/65 p-4">
          <div className="mb-2 flex items-center gap-2 text-primary"><CircleHelp size={14} /><span className="map-kicker text-[9px]">A way to think</span></div>
          <p className="serif m-0 text-[18px] leading-[1.25]">Ideas are stronger when you can see what they lead to.</p>
        </div>
        <div className="map-kicker mt-5 px-2 text-[9px] text-muted-foreground">A personal idea atlas</div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-border/75 bg-background/90 px-4 backdrop-blur-md sm:px-7 lg:px-10">
          <Link href="/" className="flex items-center gap-2 text-foreground no-underline md:hidden"><GitBranch size={18} className="text-primary" /><span className="serif text-[20px]">Fieldnotes</span></Link>
          <div className="map-kicker hidden text-[10px] text-muted-foreground md:block">{section}</div>
          <nav className="flex items-center gap-1 md:hidden" aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} data-testid={`link-mobile-${href.slice(1) || 'today'}`} className={`grid h-10 w-10 place-items-center rounded-xl no-underline ${path === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Icon size={17} /></Link>)}
          </nav>
          <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-primary/70" /> One day, one connected train of thought</div>
        </header>
        <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-7 sm:px-7 lg:px-10 lg:pt-10">{children}</div>
      </main>
    </div>
  </div>;
}

function QueryState({ loading, error, retry, label = 'thought map' }: { loading: boolean; error: boolean; retry: () => void; label?: string }) {
  if (loading) return <div className="space-y-3" aria-label={`Loading ${label}`}><div className="h-24 animate-pulse rounded-2xl bg-muted/80" /><div className="h-24 animate-pulse rounded-2xl bg-muted/60" /></div>;
  if (error) return <div className="rounded-2xl border border-destructive/20 bg-card px-6 py-9 text-center" role="alert"><div className="serif text-2xl">That didn’t load.</div><p className="mb-0 mt-1 text-sm text-muted-foreground">Your ideas are safe. Try reconnecting to this map.</p><button onClick={retry} data-testid="button-retry" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><RefreshCw size={14} /> Try again</button></div>;
  return null;
}
function CategoryPicker({ categories, value, onChange, id }: { categories: Category[]; value: string; onChange: (value: string) => void; id: string }) {
  return <select id={id} value={value} onChange={e => onChange(e.target.value)} data-testid={`select-${id}`} className="h-9 min-w-0 rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary">
    <option value="">No category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>;
}
function AddCategory({ onAdded }: { onAdded: (category: Category) => void }) {
  const client = useQueryClient();
  const createCategory = useCreateCategory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Add a name first.'); return; }
    createCategory.mutate({ data: { name: name.trim() } }, { onSuccess: category => {
      void client.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      onAdded(category); setName(''); setError(''); setOpen(false);
    }, onError: () => setError('Could not add category. Try again.') });
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} data-testid="button-add-category" className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-primary/5"><Plus size={14} /> Category</button>;
  return <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-background p-2">
    <input aria-label="Category name" autoFocus maxLength={40} value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Category name" data-testid="input-new-category" className="h-9 min-w-[120px] flex-1 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-primary" />
    <button disabled={createCategory.isPending} data-testid="button-save-category" className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">{createCategory.isPending ? 'Adding…' : 'Add'}</button>
    <button type="button" aria-label="Cancel" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X size={14} /></button>
    {error && <span role="alert" className="w-full px-2 text-xs text-destructive">{error}</span>}
  </form>;
}

function CaptureThought({ date, categories, onCreated }: { date: string; categories: Category[]; onCreated: (id: number) => void }) {
  const client = useQueryClient();
  const createThought = useCreateThought();
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [createdCategory, setCreatedCategory] = useState<Category | null>(null);
  const [error, setError] = useState('');
  const categoryOptions = createdCategory && !categories.some(c => c.id === createdCategory.id) ? [...categories, createdCategory] : categories;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) { setError('Put an idea into words first.'); return; }
    createThought.mutate({ data: { content: content.trim(), categoryId: categoryId ? Number(categoryId) : null, reviewAt: reviewAt ? new Date(reviewAt).toISOString() : null } }, {
      onSuccess: thought => { invalidateDay(client, date); setContent(''); setReviewAt(''); setError(''); onCreated(thought.id); },
      onError: () => setError('Could not save this thought. Try once more.'),
    });
  }
  return <form onSubmit={submit} className="rounded-[22px] border border-border bg-card shadow-sm">
    <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground"><Plus size={15} /></span><span className="text-[12px] font-semibold">Add an idea to the map</span><span className="map-kicker ml-auto text-[9px] text-muted-foreground">New thought block</span></div>
    <div className="p-5">
      <label htmlFor="thought-content" className="sr-only">Thought content</label>
      <textarea id="thought-content" value={content} onChange={e => { setContent(e.target.value); setError(''); }} placeholder="A question, observation, claim, or the next step in an argument…" rows={2} data-testid="input-thought-content" className="serif w-full resize-y border-0 bg-transparent p-0 text-[20px] leading-[1.45] outline-none placeholder:text-muted-foreground/55 focus:ring-0 md:text-[23px]" />
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2"><Layers3 size={14} className="text-muted-foreground" /><CategoryPicker categories={categoryOptions} value={categoryId} onChange={setCategoryId} id="capture-category" /><AddCategory onAdded={c => { setCreatedCategory(c); setCategoryId(String(c.id)); }} /></div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <label htmlFor="capture-review" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays size={13} /> Revisit</label>
          <input id="capture-review" type="datetime-local" value={reviewAt} onChange={e => setReviewAt(e.target.value)} data-testid="input-capture-review" className="h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
          <button type="submit" disabled={createThought.isPending} data-testid="button-save-thought" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-55">{createThought.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}{createThought.isPending ? 'Saving…' : 'Add thought'}</button>
        </div>
      </div>
    </div>
  </form>;
}

function ThoughtEditor({ thoughtId, categories, onClose, date }: { thoughtId: number; categories: Category[]; onClose: () => void; date: string }) {
  const client = useQueryClient();
  const query = useGetThought(thoughtId, { query: { queryKey: getGetThoughtQueryKey(thoughtId) } });
  const updateThought = useUpdateThought();
  const [content, setContent] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [reviewAt, setReviewAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const thought = query.data;
  const text = content ?? thought?.content ?? '';
  const category = categoryId ?? (thought?.categoryId ? String(thought.categoryId) : '');
  const review = reviewAt ?? localDateTime(thought?.reviewAt);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setError('A thought needs some text.'); return; }
    updateThought.mutate({ id: thoughtId, data: { content: text.trim(), categoryId: category ? Number(category) : null, reviewAt: review ? new Date(review).toISOString() : null } }, {
      onSuccess: () => { invalidateDay(client, date); void client.invalidateQueries({ queryKey: getGetThoughtQueryKey(thoughtId) }); onClose(); },
      onError: () => setError('Could not update this thought. Try again.'),
    });
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[3px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edit-title" className="w-full max-w-[580px] rounded-[24px] border border-border bg-background p-6 shadow-2xl sm:p-8">
      <div className="mb-5 flex items-start justify-between"><div><div className="map-kicker text-[9px] text-primary">Thought block</div><h2 id="edit-title" className="serif mb-0 mt-1 text-3xl">Edit this idea</h2></div><button type="button" aria-label="Close editor" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"><X size={16} /></button></div>
      {query.isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : query.isError ? <div role="alert" className="rounded-xl bg-accent/40 p-4 text-sm">Couldn’t load this block. Close and try again.</div> : <>
        <label htmlFor="edit-content" className="sr-only">Thought content</label><textarea id="edit-content" value={text} onChange={e => { setContent(e.target.value); setError(''); }} rows={5} data-testid="input-edit-content" className="serif w-full rounded-xl border border-border bg-card p-4 text-lg leading-relaxed outline-none focus:border-primary" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label htmlFor="edit-category" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</label><CategoryPicker id="edit-category" categories={categories} value={category} onChange={setCategoryId} /></div><div><label htmlFor="edit-review" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Revisit date</label><input id="edit-review" type="datetime-local" value={review} onChange={e => setReviewAt(e.target.value)} data-testid="input-edit-review" className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs outline-none focus:border-primary" /></div></div>
      </>}
      {error && <p role="alert" className="mb-0 mt-3 text-xs text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">Cancel</button><button type="submit" disabled={query.isLoading || query.isError || updateThought.isPending} data-testid="button-update-thought" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{updateThought.isPending ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </div>;
}

function ThoughtMap({ date, thoughts, links, categories, onEdit, onLinkRemoved, onConnect, sourceId, onSelectSource, onDeleteThought, linkMode }: {
  date: string; thoughts: Thought[]; links: ThoughtLink[]; categories: Category[];
  onEdit: (id: number) => void; onLinkRemoved: (link: ThoughtLink) => void;
  onConnect: (source: number, target: number) => void; sourceId: number | null;
  onSelectSource: (id: number) => void; onDeleteThought: (id: number) => void; linkMode: boolean;
}) {
  const ordered = useMemo(() => [...thoughts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [thoughts]);
  const cols = 3; const cellW = 294; const cellH = 224; const left = 28; const top = 30;
  const rows = Math.max(1, Math.ceil(ordered.length / cols));
  const width = cols * cellW + 28; const height = rows * cellH + 40;
  const positions = new Map(ordered.map((t, i) => [t.id, { x: left + (i % cols) * cellW, y: top + Math.floor(i / cols) * cellH }]));
  const validLinks = links.filter(l => positions.has(l.sourceThoughtId) && positions.has(l.targetThoughtId));
  const categoryName = (t: Thought) => categories.find(c => c.id === t.categoryId)?.name || t.categoryName;
  return <div className="map-scroll overflow-x-auto rounded-[22px] border border-border bg-card/60 p-3 sm:p-4">
    <div className="thought-map-grid relative" style={{ width, height, minWidth: width }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
        <defs><marker id={`arrow-${date.replaceAll('-', '')}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--primary) / .62)" /></marker></defs>
        {validLinks.map(link => {
          const a = positions.get(link.sourceThoughtId)!; const b = positions.get(link.targetThoughtId)!;
          const sx = a.x + 244, sy = a.y + 75; const tx = b.x, ty = b.y + 75;
          const bend = Math.max(44, Math.abs(tx - sx) * .38);
          return <path key={link.id} className={sourceId === link.sourceThoughtId ? 'map-link-selected' : 'map-link'} d={`M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 10} ${ty}`} markerEnd={`url(#arrow-${date.replaceAll('-', '')})`} />;
        })}
      </svg>
      {ordered.map((thought, index) => {
        const pos = positions.get(thought.id)!;
        const incoming = validLinks.filter(l => l.targetThoughtId === thought.id).length;
        const outgoing = validLinks.filter(l => l.sourceThoughtId === thought.id).length;
        const category = categoryName(thought);
        const isSource = sourceId === thought.id;
        return <article key={thought.id} data-testid={`card-thought-${thought.id}`} className={`map-node absolute z-[1] w-[244px] rounded-[17px] border bg-card p-4 ${isSource ? 'border-accent-foreground/55 ring-2 ring-accent/60' : 'border-border/90'}`} style={{ left: pos.x, top: pos.y }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="map-kicker text-[9px] text-muted-foreground">Idea {String(index + 1).padStart(2, '0')}</span>
            <span className="mono text-[9px] text-muted-foreground">{shortTime(thought.createdAt)}</span>
          </div>
          <p className="serif mb-0 line-clamp-4 whitespace-pre-wrap text-[17px] leading-[1.35]">{thought.content}</p>
          <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">
            {category && <span className="rounded-full bg-accent/60 px-2 py-1 text-[9px] font-semibold text-accent-foreground">{category}</span>}
            {thought.reviewAt && <span className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[9px] ${new Date(thought.reviewAt) <= new Date() ? 'text-accent-foreground' : 'text-muted-foreground'}`}><Clock3 size={10} /> {friendlyDate(thought.reviewAt, { month: 'short', day: 'numeric' })}</span>}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/65 pt-2">
            <span className="mono text-[9px] text-muted-foreground">{incoming} in · {outgoing} out</span>
            <div className="flex items-center gap-0.5">
              <button type="button" disabled={!linkMode} title={!linkMode ? 'Choose Connect ideas to start' : sourceId === null ? 'Choose as connection source' : sourceId === thought.id ? 'Cancel source selection' : 'Connect selected source to this thought'} onClick={() => { if (!linkMode) return; sourceId !== null && sourceId !== thought.id ? onConnect(sourceId, thought.id) : onSelectSource(thought.id); }} data-testid={`button-connect-thought-${thought.id}`} className={`grid h-7 w-7 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-35 ${isSource ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-primary'}`}><CornerDownRight size={14} /></button>
              <button type="button" title="Edit thought" onClick={() => onEdit(thought.id)} data-testid={`button-edit-thought-${thought.id}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Feather size={13} /></button>
              <button type="button" title="Delete thought" onClick={() => onDeleteThought(thought.id)} data-testid={`button-delete-thought-${thought.id}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={13} /></button>
            </div>
          </div>
        </article>;
      })}
      {!ordered.length && <div className="absolute inset-0 grid place-items-center"><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/70 text-accent-foreground"><GitBranch size={20} /></span><h3 className="serif mb-1 mt-4 text-2xl font-normal">The map starts with one idea.</h3><p className="mb-0 text-sm text-muted-foreground">Add a thought above, then connect it to what follows.</p></div></div>}
    </div>
    {links.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
      <span className="map-kicker mr-1 text-[9px] text-muted-foreground">Connections</span>
      {links.map(link => {
        const source = thoughts.find(t => t.id === link.sourceThoughtId); const target = thoughts.find(t => t.id === link.targetThoughtId);
        if (!source || !target) return null;
        return <span key={link.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <span className="max-w-[100px] truncate">{source.content}</span><ArrowRight size={11} className="shrink-0 text-primary" /><span className="max-w-[100px] truncate text-foreground">{target.content}</span>
          <button type="button" aria-label={`Remove connection from ${source.content} to ${target.content}`} onClick={() => onLinkRemoved(link)} data-testid={`button-delete-link-${link.id}`} className="ml-0.5 grid h-5 w-5 place-items-center rounded-full hover:bg-destructive/10 hover:text-destructive"><X size={11} /></button>
        </span>;
      })}
    </div>}
  </div>;
}

function MapPage({ date, archived = false }: { date: string; archived?: boolean }) {
  const client = useQueryClient();
  const timezoneOffsetMinutes = tzOffset(date);
  const [categoryId, setCategoryId] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [mapError, setMapError] = useState('');
  const [recentId, setRecentId] = useState<number | null>(null);
  const thoughtsQuery = useListThoughts({ date, timezoneOffsetMinutes, ...(categoryId ? { categoryId: Number(categoryId) } : {}) });
  const linksQuery = useListThoughtLinks({ date, timezoneOffsetMinutes });
  const categoriesQuery = useListCategories();
  const summaryQuery = useGetJournalSummary({ date, timezoneOffsetMinutes });
  const createLink = useCreateThoughtLink();
  const deleteLink = useDeleteThoughtLink();
  const deleteThought = useDeleteThought();
  const thoughts = thoughtsQuery.data ?? [];
  const links = linksQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const retry = () => { void thoughtsQuery.refetch(); void linksQuery.refetch(); void categoriesQuery.refetch(); void summaryQuery.refetch(); };
  function connect(source: number, target: number) {
    if (source === target) return;
    if (links.some(l => l.sourceThoughtId === source && l.targetThoughtId === target)) { setMapError('Those thoughts are already connected.'); setSourceId(null); setLinkMode(false); return; }
    createLink.mutate({ data: { sourceThoughtId: source, targetThoughtId: target, timezoneOffsetMinutes } }, {
      onSuccess: () => { void client.invalidateQueries({ queryKey: getListThoughtLinksQueryKey({ date, timezoneOffsetMinutes }) }); setSourceId(null); setLinkMode(false); setMapError(''); },
      onError: () => setMapError('Could not create that connection. Try again.'),
    });
  }
  function removeLink(link: ThoughtLink) {
    deleteLink.mutate({ id: link.id }, {
      onSuccess: () => { void client.invalidateQueries({ queryKey: getListThoughtLinksQueryKey({ date, timezoneOffsetMinutes }) }); setMapError(''); },
      onError: () => setMapError('Could not remove that connection. Try again.'),
    });
  }
  function removeThought(id: number) {
    if (!window.confirm('Delete this thought block and its connections?')) return;
    deleteThought.mutate({ id }, { onSuccess: () => { invalidateDay(client, date); setMapError(''); }, onError: () => setMapError('Could not delete that thought. Try again.') });
  }
  const isLoading = thoughtsQuery.isLoading || linksQuery.isLoading || categoriesQuery.isLoading || summaryQuery.isLoading;
  const isError = thoughtsQuery.isError || linksQuery.isError || categoriesQuery.isError || summaryQuery.isError;
  const content = <div className="fade-in">
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="map-kicker mb-3 flex items-center gap-2 text-[10px] text-primary"><span className="h-px w-6 bg-primary" />{archived ? 'A map from your archive' : 'A field of ideas'}</div>
          <h1 className="serif m-0 text-[45px] font-normal leading-[.98] tracking-[-.035em] sm:text-[57px]">{archived ? <>Thinking, <em className="text-primary">then.</em></> : <>Today’s train<br className="sm:hidden" /> <em className="text-primary">of thought.</em></>}</h1>
          <p className="mb-0 mt-3 text-sm text-muted-foreground">{friendlyDate(date)} <span className="mx-2 text-border">/</span>Separate ideas. Follow the connections.</p>
        </div>
        <div className="flex gap-2 self-start lg:self-auto">
          <div className="min-w-[112px] rounded-2xl border border-border bg-card px-4 py-3"><div className="map-kicker text-[9px] text-muted-foreground">Thought blocks</div><div className="serif mt-0.5 text-2xl">{summaryQuery.data?.thoughtCount ?? '—'}</div></div>
          <div className="min-w-[112px] rounded-2xl border border-border bg-card px-4 py-3"><div className="map-kicker text-[9px] text-muted-foreground">Due to revisit</div><div className="serif mt-0.5 text-2xl">{summaryQuery.data?.dueCount ?? '—'}</div></div>
        </div>
      </div>
      {!archived && <CaptureThought date={date} categories={categories} onCreated={setRecentId} />}
      {archived && <div className="mb-5 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[.045] px-4 py-3 text-xs text-muted-foreground"><Archive size={14} className="text-primary" /> This is a read/write day map. Edit ideas or continue its connections.</div>}
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><div className="map-kicker text-[9px] text-muted-foreground">Directed idea map</div><h2 className="serif mb-0 mt-1 text-[27px] font-normal">{thoughts.length} {thoughts.length === 1 ? 'thought' : 'thoughts'} · {links.length} {links.length === 1 ? 'connection' : 'connections'}</h2></div>
          <div className="flex flex-wrap items-center gap-2"><CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} id="map-category-filter" /><button type="button" onClick={() => { setLinkMode(!linkMode); setSourceId(null); setMapError(''); }} data-testid="button-cancel-connect" aria-pressed={linkMode} className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${linkMode ? 'border-accent-foreground/30 bg-accent/40 text-accent-foreground' : 'border-border text-muted-foreground hover:bg-card'}`}>{linkMode ? <X size={13} /> : <GitBranch size={13} />}{linkMode ? 'Cancel linking' : 'Connect ideas'}</button></div>
        </div>
        {linkMode && sourceId === null && <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[.045] px-3 py-2.5 text-xs text-muted-foreground"><GitBranch size={14} className="text-primary" /> Choose the first thought block’s arrow to set where the train begins.</div>}
        {sourceId !== null && <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent-foreground/20 bg-accent/25 px-3 py-2.5 text-xs text-accent-foreground"><CornerDownRight size={14} /> Source selected. Choose another block’s link arrow to create a directed connection. Branches are welcome.</div>}
        {mapError && <div role="alert" className="mb-3 flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{mapError}<button type="button" onClick={() => setMapError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
        {isLoading ? <QueryState loading error={false} retry={retry} /> : isError ? <QueryState loading={false} error retry={retry} /> : <ThoughtMap date={date} thoughts={thoughts} links={links} categories={categories} onEdit={setEditing} onLinkRemoved={removeLink} onConnect={connect} sourceId={sourceId} linkMode={linkMode} onSelectSource={id => { setSourceId(sourceId === id ? null : id); setMapError(''); }} onDeleteThought={removeThought} />}
        {recentId !== null && <span className="sr-only" aria-live="polite">Thought added to the map.</span>}
        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground"><ArrowUpRight size={13} className="text-primary" /> Select Connect ideas, then choose two blocks. Arrows point from one idea to what follows.</div>
      </section>
      {editing !== null && <ThoughtEditor thoughtId={editing} categories={categories} date={date} onClose={() => setEditing(null)} />}
    </div>;
  return archived ? content : <Shell section="Today · thought map">{content}</Shell>;
}

function HomePage() { return <MapPage date={todayISO()} />; }

function ReviewPage() {
  const client = useQueryClient();
  const query = useListThoughts({ reviewDue: true });
  const categoriesQuery = useListCategories();
  const reviewThought = useReviewThought();
  const [editing, setEditing] = useState<number | null>(null);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState('');
  const [error, setError] = useState('');
  const thoughts = query.data ?? [];
  const categories = categoriesQuery.data ?? [];
  function markReviewed(id: number) {
    reviewThought.mutate({ id, data: { nextReviewAt: scheduleId === id && schedule ? new Date(schedule).toISOString() : null } }, {
      onSuccess: () => { invalidateThoughtLists(client); setScheduleId(null); setSchedule(''); setError(''); },
      onError: () => setError('Could not update review status. Try again.'),
    });
  }
  return <Shell section="Revisit · due thoughts"><div className="fade-in">
    <div className="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
      <div><div className="map-kicker mb-3 flex items-center gap-2 text-[10px] text-primary"><span className="h-px w-6 bg-primary" />Return with fresh eyes</div><h1 className="serif m-0 text-[49px] font-normal leading-[.98] tracking-[-.035em] md:text-[62px]">Ideas, <em className="text-primary">again.</em></h1><p className="mb-0 mt-3 max-w-[520px] text-sm leading-relaxed text-muted-foreground">Your review queue gathers the thoughts you planned to revisit. Reconsider them, then decide if they need another return.</p></div>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground"><RotateCcw size={18} /></span><div><div className="serif text-[26px] leading-none">{query.data?.length ?? '—'}</div><div className="map-kicker mt-1 text-[9px] text-muted-foreground">Ready to revisit</div></div></div>
    </div>
    {error && <div role="alert" className="mb-3 text-xs text-destructive">{error}</div>}
    {query.isLoading ? <QueryState loading error={false} retry={() => void query.refetch()} label="review queue" /> : query.isError || categoriesQuery.isError ? <QueryState loading={false} error retry={() => { void query.refetch(); void categoriesQuery.refetch(); }} label="review queue" /> : thoughts.length ? <div className="grid gap-3 md:grid-cols-2">
      {thoughts.map((t, i) => <article key={t.id} data-testid={`card-review-thought-${t.id}`} className="thought-card rounded-[20px] border border-border bg-card p-5" style={{ animationDelay: `${i * 45}ms` }}>
        <div className="mb-3 flex flex-wrap items-center gap-2"><span className="map-kicker text-[9px] text-muted-foreground">From {friendlyDate(t.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span>{t.categoryName && <span className="rounded-full bg-accent/60 px-2 py-1 text-[9px] font-semibold text-accent-foreground">{t.categoryName}</span>}{t.reviewAt && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 size={11} /> Due {friendlyDate(t.reviewAt, { month: 'short', day: 'numeric' })}</span>}</div>
        <p className="serif whitespace-pre-wrap text-[20px] leading-[1.45]">{t.content}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <button type="button" onClick={() => setEditing(t.id)} data-testid={`button-edit-review-${t.id}`} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">Edit thought</button>
          <div className="flex flex-wrap items-center gap-2">
            {scheduleId === t.id && <><label htmlFor={`review-next-${t.id}`} className="sr-only">Next revisit date</label><input id={`review-next-${t.id}`} type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} data-testid={`input-review-next-${t.id}`} className="h-9 rounded-lg border border-border bg-background px-2 text-[11px] outline-none focus:border-primary" /></>}
            <button type="button" onClick={() => { if (scheduleId === t.id) markReviewed(t.id); else { setScheduleId(t.id); setSchedule(''); } }} disabled={reviewThought.isPending} data-testid={`button-reviewed-${t.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-50">{scheduleId === t.id ? <Check size={13} /> : <CalendarDays size={13} />}{scheduleId === t.id ? 'Mark revisited' : 'Revisit again?'}</button>
            {scheduleId === t.id && <button type="button" onClick={() => markReviewed(t.id)} disabled={reviewThought.isPending} className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted">Done for now</button>}
          </div>
        </div>
      </article>)}
    </div> : <div className="rounded-[22px] border border-dashed border-border bg-card/60 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/60 text-accent-foreground"><Check size={20} /></span><h2 className="serif mb-1 mt-4 text-2xl font-normal">Nothing due right now.</h2><p className="mx-auto mb-0 max-w-sm text-sm leading-relaxed text-muted-foreground">When a thought is ready for another look, it’ll show up here.</p><Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary no-underline"><ArrowLeft size={15} /> Back to today’s map</Link></div>}
    {editing !== null && <ThoughtEditor thoughtId={editing} categories={categories} date={todayISO()} onClose={() => { setEditing(null); void client.invalidateQueries({ queryKey: getListThoughtsQueryKey() }); }} />}
  </div></Shell>;
}

function ArchivePage() {
  const [month, setMonth] = useState(monthISO(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const timezoneOffsetMinutes = tzOffset(`${month}-15`);
  const daysQuery = useListJournalDays({ month, timezoneOffsetMinutes });
  const summaryQuery = useGetJournalSummary({ date: selectedDate, timezoneOffsetMinutes: tzOffset(selectedDate) });
  const days = daysQuery.data ?? [];
  const daysWithThoughts = new Set(days.filter(d => d.thoughtCount > 0).map(d => d.date.slice(0, 10)));
  const cells = useMemo(() => {
    const first = new Date(`${month}-01T12:00:00`);
    const blanks = (first.getDay() + 6) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return [...Array(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);
  function changeMonth(amount: number) {
    const d = new Date(`${month}-01T12:00:00`); d.setMonth(d.getMonth() + amount);
    const next = monthISO(d); setMonth(next);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setSelectedDate(`${next}-${String(Math.min(Number(selectedDate.slice(-2)), maxDay)).padStart(2, '0')}`);
  }
  return <Shell section="Archive · choose a day"><div className="fade-in">
    <div className="mb-8"><div className="map-kicker mb-3 flex items-center gap-2 text-[10px] text-primary"><span className="h-px w-6 bg-primary" />The growing atlas</div><h1 className="serif m-0 text-[49px] font-normal leading-[.98] tracking-[-.035em] md:text-[62px]">Return to a<br className="sm:hidden" /> <em className="text-primary">day’s map.</em></h1><p className="mb-0 mt-3 text-sm text-muted-foreground">Choose a date to reopen that day’s ideas and connections.</p></div>
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <section className="rounded-[22px] border border-border bg-card p-5">
        <div className="mb-5 flex items-center justify-between"><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} data-testid="button-previous-month" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ChevronLeft size={17} /></button><h2 className="serif mb-0 text-2xl font-normal">{friendlyDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h2><button type="button" aria-label="Next month" onClick={() => changeMonth(1)} data-testid="button-next-month" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"><ChevronRight size={17} /></button></div>
        {daysQuery.isLoading ? <div className="grid grid-cols-7 gap-2">{Array.from({ length: 35 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/70" />)}</div> : daysQuery.isError ? <QueryState loading={false} error retry={() => void daysQuery.refetch()} label="calendar" /> : <>
          <div className="mb-2 grid grid-cols-7 text-center">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={`${d}-${i}`} className="map-kicker py-2 text-[9px] text-muted-foreground">{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1.5">{cells.map((n, i) => {
            if (!n) return <span key={`blank-${i}`} />;
            const date = `${month}-${String(n).padStart(2, '0')}`;
            const hasThoughts = daysWithThoughts.has(date);
            return <button key={date} type="button" onClick={() => setSelectedDate(date)} data-testid={`button-select-date-${date}`} aria-label={`${friendlyDate(date, { month: 'long', day: 'numeric' })}${hasThoughts ? ', has thoughts' : ''}`} className={`relative grid aspect-square place-items-center rounded-xl text-xs transition-colors ${selectedDate === date ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${hasThoughts && selectedDate !== date ? 'font-semibold text-primary' : ''}`}>
              {n}{hasThoughts && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selectedDate === date ? 'bg-primary-foreground' : 'bg-primary'}`} />}
            </button>;
          })}</div>
          <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4 text-xs text-muted-foreground"><span>{friendlyDate(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="serif text-2xl text-foreground">{summaryQuery.data?.thoughtCount ?? '—'} <span className="sans text-xs text-muted-foreground">ideas</span></span></div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setMonth(monthISO(new Date())); setSelectedDate(todayISO()); }} data-testid="button-jump-today" className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-muted"><CalendarDays size={13} /> Today</button><div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Has thoughts</div></div>
        </>}
      </section>
      <section className="min-w-0">
        {summaryQuery.isError ? <QueryState loading={false} error retry={() => void summaryQuery.refetch()} label="selected day" /> : <MapPage key={selectedDate} date={selectedDate} archived />}
      </section>
    </div>
  </div></Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Router><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/review" component={ReviewPage} />
    <Route path="/archive" component={ArchivePage} />
    <Route component={NotFound} />
  </Switch></Router><Toaster /></ErrorBoundary></TooltipProvider></QueryClientProvider>;
}
export default App;
