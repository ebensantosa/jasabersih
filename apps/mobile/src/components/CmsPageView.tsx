import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { api } from '../lib/api';

type Page = { slug: string; title: string; bodyMarkdown: string; updatedAt: string };

// Lightweight markdown renderer - handles headings (#, ##, ###), bullets (- or *),
// bold (**text**), and paragraphs. Cukup untuk halaman statis CMS.
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let inList: string[] = [];

  function flushList(key: number) {
    if (inList.length === 0) return;
    blocks.push(
      <View key={`list-${key}`} className="my-1">
        {inList.map((item, i) => (
          <View key={i} className="flex-row gap-2 py-0.5">
            <Text className="font-sans text-sm text-ink-700">•</Text>
            <Text className="font-sans flex-1 text-sm text-ink-700">{renderInline(item)}</Text>
          </View>
        ))}
      </View>,
    );
    inList = [];
  }

  function renderInline(text: string): React.ReactNode {
    // Split by **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <Text key={i} className="font-bold">{p.slice(2, -2)}</Text>;
      }
      return p;
    });
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) { flushList(i); return; }

    if (trimmed.startsWith('### ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-3 text-sm text-ink-900">{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith('## ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-4 text-base text-ink-900">{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith('# ')) {
      flushList(i);
      blocks.push(<Text key={i} className="font-bold mt-4 text-lg text-ink-900">{trimmed.slice(2)}</Text>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList.push(trimmed.slice(2));
    } else {
      flushList(i);
      blocks.push(<Text key={i} className="font-sans my-1 text-sm leading-6 text-ink-700">{renderInline(trimmed)}</Text>);
    }
  });
  flushList(lines.length);

  return blocks;
}

export function CmsPageView({ slug, fallbackTitle }: { slug: string; fallbackTitle?: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/app/pages/${slug}`)
      .then((r) => {
        const data = r.data?.data ?? r.data;
        if (data) setPage(data as Page);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator color="#1D4ED8" /></View>;
  }

  if (notFound || !page) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="font-bold text-base text-ink-900">{fallbackTitle ?? 'Halaman belum tersedia'}</Text>
        <Text className="font-sans mt-2 text-center text-xs text-ink-500">
          Admin belum publish konten ini di dashboard CMS.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text className="font-bold mb-2 text-xl text-ink-900">{page.title}</Text>
      <Text className="font-sans mb-4 text-[10px] text-ink-400">
        Diperbarui: {new Date(page.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
      </Text>
      {renderMarkdown(page.bodyMarkdown)}
    </ScrollView>
  );
}
