import { createResource, createSignal, Show, For } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { listMapsApi, myMapsApi, deleteMapApi, forkMapApi, mapThumbnailUrl } from '~/api/mapApi';
import { Button, Card, Spinner, Badge, Input, Select, Tabs } from '~/ui';
import type { MapSumaryRespBody } from '@generale/types';

const SORT_OPTIONS = [
  { value: 'updated', label: '最新' },
  { value: 'usage', label: '最热' },
  { value: 'largest', label: '最大' },
  { value: 'smallest', label: '最小' },
];

export default function MapsPage() {
  const [searchParams, setSearchParams] = useSearchParams<{ tab?: string; search?: string; sort?: string }>();
  const tab = () => searchParams.tab === 'my' ? 'my' : 'public';
  const searchText = () => searchParams.search || '';
  const sortBy = () => searchParams.sort || 'updated';

  const [searchInput, setSearchInput] = createSignal(searchText());

  const query = () => {
    const q: Record<string, string> = {};
    if (searchText()) q.search = searchText();
    if (sortBy() !== 'updated') q.sortBy = sortBy();
    return q;
  };

  const [maps, { refetch }] = createResource(
    () => ({ tab: tab(), query: query() }),
    async (src) => {
      if (src.tab === 'my') {
        const res = await myMapsApi(src.query);
        return res.data;
      }
      const res = await listMapsApi(src.query);
      return res.data;
    }
  );

  function doSearch() {
    setSearchParams({ search: searchInput().trim() || undefined, sort: sortBy() !== 'updated' ? sortBy() : undefined });
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此地图？')) return;
    await deleteMapApi(id);
    refetch();
  }

  async function handleFork(id: string) {
    try {
      await forkMapApi(id);
      refetch();
    } catch (e: any) {
      alert(`Fork 失败: ${e.message}`);
    }
  }

  return (
    <main class="container mx-auto p-6 max-w-6xl">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">地图工坊</h1>
        <A href="/maps/editor">
          <Button variant="primary" size="sm">创建地图</Button>
        </A>
      </div>

      <Tabs bordered class="mb-4">
        <A
          href="/maps"
          class={`tab ${tab() === 'public' ? 'tab-active' : ''}`}
        >
          公开地图
        </A>
        <A
          href={`/maps?tab=my${searchText() ? `&search=${encodeURIComponent(searchText())}` : ''}${sortBy() !== 'updated' ? `&sort=${sortBy()}` : ''}`}
          class={`tab ${tab() === 'my' ? 'tab-active' : ''}`}
        >
          我的地图
        </A>
      </Tabs>

      <div class="flex gap-2 mb-4">
        <Input
          value={searchInput()}
          onInput={(e) => setSearchInput(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          placeholder="搜索名称或标签..."
          size="sm"
          class="flex-1 max-w-xs"
        />
        <Button variant="ghost" size="sm" onClick={doSearch}>搜索</Button>
        <Show when={searchText()}>
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); setSearchParams({ search: undefined, sort: sortBy() !== 'updated' ? sortBy() : undefined }); }}>清空</Button>
        </Show>
        <Select bordered size="sm"
          value={sortBy()}
          onChange={(e) => setSearchParams({ sort: e.currentTarget.value !== 'updated' ? e.currentTarget.value : undefined, search: searchText() || undefined })}
        >
          {SORT_OPTIONS.map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      <Show when={!maps.loading} fallback={<div class="flex justify-center py-12"><Spinner /></div>}>
        <Show when={maps() && maps()!.length > 0} fallback={
          <div class="text-center py-12 text-base-content/50">
            {searchText() ? '未找到匹配的地图。' : '暂无地图。'}
            <br />
            <A href="/maps/editor" class="link link-primary">创建第一张地图</A>
          </div>
        }>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={maps()}>
              {(m) => <MapCard map={m} onDelete={handleDelete} onFork={handleFork} isOwner={tab() === 'my'} />}
            </For>
          </div>
        </Show>
      </Show>
    </main>
  );
}

function MapCard(props: { map: MapSumaryRespBody; onDelete: (id: string) => void; onFork: (id: string) => void; isOwner: boolean }) {
  const m = props.map;

  const editorLink = () => props.isOwner ? `/maps/editor/${m.id}` : `/maps/preview/${m.id}`;

  return (
    <Card class="overflow-hidden">
      <A href={editorLink()} class="block">
        <div class="h-32 bg-base-300 flex items-center justify-center overflow-hidden">
          <img
            src={mapThumbnailUrl(m.id)}
            alt={m.name}
            class="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </A>
      <div class="p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <A href={editorLink()} class="font-semibold text-sm hover:link truncate block">
              {m.name}
            </A>
            <div class="text-xs text-base-content/60 mt-0.5">
              {m.authorName} · {m.width}×{m.height}
            </div>
          </div>
          <div class="flex gap-1 shrink-0">
            <Show when={m.isDraft}>
              <Badge variant="warning" class="badge-xs">草稿</Badge>
            </Show>
            <Show when={m.isPublic && !m.isDraft}>
              <Badge variant="success" class="badge-xs">公开</Badge>
            </Show>
          </div>
        </div>
        <Show when={m.description}>
          <p class="text-xs text-base-content/50 mt-1 line-clamp-2">{m.description}</p>
        </Show>
        <div class="flex gap-1 mt-2">
          <A href={editorLink()}>
            <Button size="xs" variant="ghost">{props.isOwner ? '编辑' : '预览'}</Button>
          </A>
          <Show when={!props.isOwner}>
            <Button size="xs" variant="ghost" onClick={() => props.onFork(m.id)}>Fork</Button>
          </Show>
          <Show when={props.isOwner}>
            <Button size="xs" variant="ghost" onClick={() => props.onDelete(m.id)}>删除</Button>
          </Show>
        </div>
      </div>
    </Card>
  );
}
