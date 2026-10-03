import { useEffect, useState } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { subscribePush, unsubscribePush, pushSupported } from '../lib/push.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

function Toggle({ on, onClick, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`ios-toggle${on ? ' on' : ''}`} onClick={onClick}>
      <span className="ios-toggle-knob" />
    </button>
  );
}

export default function SettingsNotifications() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [prefs, setPrefs] = useState({}); // event_key -> boolean
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      db.getNotificationSettings().catch(() => null),
      db.listNotificationTemplates().catch(() => []),
      db.listNotificationEventPrefs().catch(() => []),
    ]).then(([settings, tpls, prefRows]) => {
      setPushEnabledState(!!settings?.push_enabled);
      setTemplates((tpls || []).filter((t) => t.active));
      const m = {};
      (prefRows || []).forEach((p) => { m[p.event_key] = p.enabled; });
      setPrefs(m);
    }).finally(() => setLoading(false));
  }, []);

  const togglePush = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!pushEnabled) {
        if (!pushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');
        const sub = await subscribePush();
        await db.addPushSubscription(user.id, sub);
        await db.setPushEnabled(user.id, true);
        setPushEnabledState(true);
      } else {
        const sub = await unsubscribePush();
        if (sub?.endpoint) await db.removePushSubscription(sub.endpoint).catch(() => {});
        await db.setPushEnabled(user.id, false);
        setPushEnabledState(false);
      }
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const toggleEvent = async (eventKey) => {
    if (busy) return;
    const next = !(prefs[eventKey] ?? true);
    setPrefs((prev) => ({ ...prev, [eventKey]: next }));
    try { await db.setNotificationEventPref(user.id, eventKey, next); }
    catch (e) { alert(e.message); setPrefs((prev) => ({ ...prev, [eventKey]: !next })); }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="알림 관리" flat />

      <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 16px rgba(25,23,34,.05)', padding: '14px 16px', marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13.75, fontWeight: 700, color: '#191722' }}>푸시 알림</div>
            <div style={{ marginTop: 2, fontSize: 11.5, color: '#a29ead' }}>기기로 알림을 받습니다. 꺼도 알림 탭에는 계속 쌓여요.</div>
          </div>
          <Toggle on={pushEnabled} onClick={togglePush} disabled={busy} label="푸시 알림" />
        </div>
      </div>

      {pushEnabled && (
        <div style={{ marginTop: 18 }}>
          <div className="settings-group-label">상황별 알림</div>
          {templates.length === 0 ? (
            <div className="small muted" style={{ marginTop: 8 }}>설정 가능한 알림 상황이 없습니다.</div>
          ) : (
            <div className="tx-daycard">
              {templates.map((t, i) => (
                <div key={t.event_key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: t.color || '#f4f2f0' }}>
                    {t.emoji || '🔔'}
                  </span>
                  <span style={{ flex: 1, fontSize: 13.25, fontWeight: 600, color: '#191722' }}>{t.title_template || t.event_key}</span>
                  <Toggle on={prefs[t.event_key] ?? true} onClick={() => toggleEvent(t.event_key)} disabled={busy} label={t.title_template || t.event_key} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
