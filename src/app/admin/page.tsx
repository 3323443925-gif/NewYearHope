'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  EyeOff,
  Loader2,
  Shield,
  Trash2,
} from 'lucide-react';
import type { AdminLanternItem, AdminReplyItem } from '@/types/lantern';

const TOKEN_STORAGE_KEY = 'starlight_admin_token_ui';

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'lanterns' | 'replies'>('lanterns');
  const [filter, setFilter] = useState<'reported' | 'all' | 'images'>('reported');
  const [lanterns, setLanterns] = useState<AdminLanternItem[]>([]);
  const [replies, setReplies] = useState<AdminReplyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(
    async (activeToken: string, activeTab = tab, activeFilter = filter) => {
      setLoading(true);
      setError(null);
      try {
        const endpoint =
          activeTab === 'lanterns'
            ? `/api/admin/lanterns?filter=${activeFilter}`
            : `/api/admin/replies?filter=${activeFilter === 'reported' ? 'reported' : 'all'}`;
        const res = await fetch(endpoint, {
          headers: { 'x-admin-token': activeToken },
        });
        if (res.status === 401) {
          setAuthed(false);
          setError('管理员口令无效，请核对 .env 中的 ADMIN_TOKEN。');
          return;
        }
        const json = (await res.json()) as {
          lanterns?: AdminLanternItem[];
          replies?: AdminReplyItem[];
        };
        setAuthed(true);
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, activeToken);
        if (activeTab === 'lanterns') {
          setLanterns(json.lanterns ?? []);
        } else {
          setReplies(json.replies ?? []);
        }
      } catch {
        setError('加载失败，请检查网络连接。');
      } finally {
        setLoading(false);
      }
    },
    [tab, filter]
  );

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) {
      setToken(saved);
      loadData(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    loadData(token.trim());
  };

  const updateLanternStatus = async (
    id: string,
    status: 'active' | 'hidden_by_report' | 'deleted_by_admin'
  ) => {
    const res = await fetch('/api/admin/lanterns', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setNotice(`已更新灯盏状态为 ${status}`);
      loadData(token);
    }
  };

  const updateReplyStatus = async (
    id: string,
    status: 'active' | 'hidden_by_report' | 'deleted_by_admin'
  ) => {
    const res = await fetch('/api/admin/replies', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setNotice(`已更新回复状态为 ${status}`);
      loadData(token);
    }
  };

  const banIp = async (ipHash: string) => {
    if (!ipHash || ipHash === 'seed') return;
    const res = await fetch('/api/admin/lanterns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify({ ipHash, reason: 'admin_manual_ban' }),
    });
    if (res.ok) {
      setNotice(`已封禁来源哈希 ${ipHash.slice(0, 12)}…`);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-sky-200 hover:text-amber-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回星屿夜空
            </Link>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-amber-100">
              <Shield className="h-5 w-5 text-amber-300" />
              星屿祈光 · 管理员守护后台
            </h1>
          </div>
          {notice && (
            <div className="rounded-full border border-amber-300/30 bg-amber-300/15 px-3.5 py-1.5 text-xs text-amber-100">
              {notice}
            </div>
          )}
        </div>

        {!authed ? (
          <form
            onSubmit={handleLogin}
            className="mx-auto mt-16 max-w-md rounded-3xl border border-amber-200/20 bg-[#0b1736]/90 p-6 shadow-xl backdrop-blur-xl"
          >
            <h2 className="text-base font-semibold text-amber-100">管理员身份验证</h2>
            <p className="mt-1 text-xs text-slate-300">
              请输入部署环境变量中的 <code>ADMIN_TOKEN</code>（本地默认开发口令见{' '}
              <code>.env.example</code>）。
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="输入 ADMIN_TOKEN"
              className="mt-4 w-full rounded-xl border border-white/15 bg-[#060f26] px-3.5 py-2.5 text-sm text-white focus:border-amber-300/60 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-rose-200">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-xl bg-amber-300 py-2.5 text-sm font-semibold text-[#1a1208] hover:bg-amber-200"
            >
              {loading ? '验证中…' : '进入守护后台'}
            </button>
          </form>
        ) : (
          <div>
            {/* Tabs & Filters */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTab('lanterns');
                    loadData(token, 'lanterns', filter);
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-medium ${
                    tab === 'lanterns'
                      ? 'bg-amber-300 text-[#1a1208]'
                      : 'border border-white/15 bg-white/5 text-slate-200'
                  }`}
                >
                  星灯留言
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('replies');
                    const nextF = filter === 'images' ? 'all' : filter;
                    setFilter(nextF);
                    loadData(token, 'replies', nextF);
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-medium ${
                    tab === 'replies'
                      ? 'bg-amber-300 text-[#1a1208]'
                      : 'border border-white/15 bg-white/5 text-slate-200'
                  }`}
                >
                  陌生人回复
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {(['reported', 'all', ...(tab === 'lanterns' ? ['images'] : [])] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFilter(f as 'reported' | 'all' | 'images');
                        loadData(token, tab, f as 'reported' | 'all' | 'images');
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        filter === f
                          ? 'border-sky-300/70 bg-sky-300/20 text-sky-100'
                          : 'border-white/15 bg-white/5 text-slate-300'
                      }`}
                    >
                      {f === 'reported'
                        ? '被举报 / 自动隐藏'
                        : f === 'images'
                        ? '含图片'
                        : '全部最新'}
                    </button>
                  )
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
              </div>
            ) : tab === 'lanterns' ? (
              <div className="space-y-3">
                {lanterns.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
                    当前筛选下暂无记录，夜空很安宁 ✨
                  </div>
                ) : (
                  lanterns.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-[#0b1736]/80 p-4 backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                              item.status === 'active'
                                ? 'bg-emerald-400/20 text-emerald-200'
                                : 'bg-rose-400/20 text-rose-200'
                            }`}
                          >
                            {item.status}
                          </span>
                          <span className="text-amber-200">
                            举报数: {item.reportCount}
                          </span>
                          <span className="text-slate-400">
                            {item.nickname || '匿名'} ·{' '}
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateLanternStatus(item.id, 'active')}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 text-[11px] text-emerald-100 hover:bg-emerald-400/25"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            恢复展示
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateLanternStatus(item.id, 'hidden_by_report')
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1 text-[11px] text-amber-100 hover:bg-amber-400/25"
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                            隐藏
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateLanternStatus(item.id, 'deleted_by_admin')
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300/30 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-100 hover:bg-rose-500/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                          {item.ipHash !== 'seed' && (
                            <button
                              type="button"
                              onClick={() => banIp(item.ipHash)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-rose-500/20 hover:text-rose-100"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              封禁IP
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="mt-2.5 whitespace-pre-wrap text-sm text-slate-100">
                        {item.content}
                      </p>

                      {item.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.imageUrl}
                          alt="Attachment"
                          className="mt-3 max-h-48 rounded-xl border border-white/10 object-cover"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {replies.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
                    当前筛选下暂无回复记录 ✨
                  </div>
                ) : (
                  replies.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-white/10 bg-[#0b1736]/80 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                              r.status === 'active'
                                ? 'bg-emerald-400/20 text-emerald-200'
                                : 'bg-rose-400/20 text-rose-200'
                            }`}
                          >
                            {r.status}
                          </span>
                          <span className="text-amber-200">举报数: {r.reportCount}</span>
                          <span className="text-slate-400">{r.nickname || '匿名'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateReplyStatus(r.id, 'active')}
                            className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 text-[11px] text-emerald-100"
                          >
                            恢复
                          </button>
                          <button
                            type="button"
                            onClick={() => updateReplyStatus(r.id, 'deleted_by_admin')}
                            className="rounded-lg border border-rose-300/30 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-100"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-100">{r.content}</p>
                      {r.lanternPreview && (
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          所属星灯：{r.lanternPreview}…
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
