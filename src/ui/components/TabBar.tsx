import type { Route } from '../router';
import { Icon, type IconName } from './Icon';

const TABS: { route: Route['name']; href: string; label: string; icon: IconName }[] = [
  { route: 'today', href: '#/', label: 'Today', icon: 'today' },
  { route: 'history', href: '#/history', label: 'History', icon: 'history' },
  { route: 'trends', href: '#/trends', label: 'Trends', icon: 'trends' },
  { route: 'settings', href: '#/settings', label: 'Settings', icon: 'settings' },
];

export function TabBar({ current }: { current: Route['name'] }) {
  return (
    <nav class="tabbar" aria-label="Main">
      <ul>
        {TABS.map((t) => (
          <li key={t.route}>
            <a href={t.href} aria-current={current === t.route ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
