import { useCallback, useEffect, useState } from 'react';
import { adminKey, apiBaseUrl } from '../firebase';

export type HomeHeroBanner = {
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  gradientFrom: string;
  gradientTo: string;
};

export type PromoSlide = {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  bgFrom: string;
  bgTo: string;
};

export type HomeBannersConfig = {
  hero: HomeHeroBanner;
  promos: PromoSlide[];
  updatedAt: number;
};

async function adminFetch(path: string, init?: RequestInit) {
  const key = localStorage.getItem('cc_admin_key') || adminKey;
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': key,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function HomeBannersPanel() {
  const [banners, setBanners] = useState<HomeBannersConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminFetch('/admin/banners/home');
      setBanners(data.banners as HomeBannersConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!banners) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const data = await adminFetch('/admin/banners/home', {
        method: 'PUT',
        body: JSON.stringify(banners),
      });
      setBanners(data.banners as HomeBannersConfig);
      setOk('Saved — Luma home will update within a few seconds');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addPromo = () => {
    if (!banners) return;
    const id = `promo_${Date.now().toString(36)}`;
    setBanners({
      ...banners,
      promos: [
        ...banners.promos,
        {
          id,
          enabled: true,
          title: 'New promo',
          subtitle: 'Admin message',
          imageUrl: '',
          ctaLabel: 'Open',
          ctaHref: '/profile',
          bgFrom: '#1a1520',
          bgTo: '#332038',
        },
      ],
    });
  };

  if (!banners) {
    return (
      <div className="panel">
        <h3 className="section-title">Home banners</h3>
        <p className="muted">{error || 'Loading…'}</p>
      </div>
    );
  }

  const { hero, promos } = banners;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3 className="section-title">Luma home banners</h3>
          <p className="muted">
            Compact hero + swipe promo strip. Changes appear on the user app home.
          </p>
        </div>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save banners'}
        </button>
      </div>

      {error ? <div className="banner danger">{error}</div> : null}
      {ok ? <div className="banner success">{ok}</div> : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h4>Hero (Meet friends)</h4>
        <label className="check">
          <input
            type="checkbox"
            checked={hero.enabled}
            onChange={(e) =>
              setBanners({ ...banners, hero: { ...hero, enabled: e.target.checked } })
            }
          />
          Show hero
        </label>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <label>
            Title
            <input
              value={hero.title}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, title: e.target.value } })
              }
            />
          </label>
          <label>
            Subtitle
            <input
              value={hero.subtitle}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, subtitle: e.target.value } })
              }
            />
          </label>
          <label>
            CTA label
            <input
              value={hero.ctaLabel}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, ctaLabel: e.target.value } })
              }
            />
          </label>
          <label>
            CTA link
            <input
              value={hero.ctaHref}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, ctaHref: e.target.value } })
              }
              placeholder="/match"
            />
          </label>
          <label>
            Gradient from
            <input
              value={hero.gradientFrom}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, gradientFrom: e.target.value } })
              }
            />
          </label>
          <label>
            Gradient to
            <input
              value={hero.gradientTo}
              onChange={(e) =>
                setBanners({ ...banners, hero: { ...hero, gradientTo: e.target.value } })
              }
            />
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h4>Swipe promo banners</h4>
          <button type="button" className="btn ghost" onClick={addPromo}>
            + Add slide
          </button>
        </div>
        <div className="stack" style={{ gap: 14, marginTop: 12 }}>
          {promos.map((p, idx) => (
            <div key={p.id} className="card nested">
              <div className="panel-head">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, enabled: e.target.checked };
                      setBanners({ ...banners, promos: next });
                    }}
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  className="btn danger ghost"
                  onClick={() =>
                    setBanners({
                      ...banners,
                      promos: promos.filter((x) => x.id !== p.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
              <div className="grid-2">
                <label>
                  Title
                  <input
                    value={p.title}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, title: e.target.value };
                      setBanners({ ...banners, promos: next });
                    }}
                  />
                </label>
                <label>
                  Subtitle
                  <input
                    value={p.subtitle}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, subtitle: e.target.value };
                      setBanners({ ...banners, promos: next });
                    }}
                  />
                </label>
                <label>
                  Image URL (optional)
                  <input
                    value={p.imageUrl}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, imageUrl: e.target.value };
                      setBanners({ ...banners, promos: next });
                    }}
                    placeholder="https://…"
                  />
                </label>
                <label>
                  CTA link
                  <input
                    value={p.ctaHref}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, ctaHref: e.target.value };
                      setBanners({ ...banners, promos: next });
                    }}
                  />
                </label>
                <label>
                  CTA label
                  <input
                    value={p.ctaLabel}
                    onChange={(e) => {
                      const next = [...promos];
                      next[idx] = { ...p, ctaLabel: e.target.value };
                      setBanners({ ...banners, promos: next });
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
