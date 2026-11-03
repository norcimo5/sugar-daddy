import type { StatusKind } from '../../domain/types';
import { statusLabel } from '../../domain/thresholds';
import { Icon, type IconName } from './Icon';

const ICONS: Record<StatusKind, IconName> = {
  unconfigured: 'dash',
  in_range: 'check',
  below_target: 'down',
  above_target: 'up',
  below_alert: 'down',
  above_alert: 'up',
};

/** Status is always text + icon, never colour alone. */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span class="status" data-kind={kind}>
      <Icon name={ICONS[kind]} />
      <span>{statusLabel(kind)}</span>
    </span>
  );
}
