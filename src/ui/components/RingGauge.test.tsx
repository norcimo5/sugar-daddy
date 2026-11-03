import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { RingGauge } from './RingGauge';

describe('RingGauge', () => {
  it('exposes an accessible group label with value, unit and caption', () => {
    render(<RingGauge value="112" unit="mg/dL" caption="Today at 08:10" />);
    expect(
      screen.getByRole('group', { name: 'Latest reading: 112 mg/dL, Today at 08:10' }),
    ).toBeInTheDocument();
  });

  it('uses a custom label prefix when given', () => {
    render(<RingGauge value="6.2" unit="mmol/L" caption="Yesterday" label="Latest glucose" />);
    expect(
      screen.getByRole('group', { name: 'Latest glucose: 6.2 mmol/L, Yesterday' }),
    ).toBeInTheDocument();
  });

  it('shows value, unit and caption in the centre, with the SVG hidden from AT', () => {
    const { container } = render(<RingGauge value="98" unit="mg/dL" caption="Now" />);
    expect(container.querySelector('.ring-value')).toHaveTextContent('98');
    expect(screen.getByText('mg/dL')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws tick marks and decorative rings always', () => {
    const { container } = render(<RingGauge value="98" unit="mg/dL" caption="Now" />);
    expect(container.querySelectorAll('.ring-tick').length).toBeGreaterThanOrEqual(24);
    expect(container.querySelector('.ring-outer')).not.toBeNull();
    expect(container.querySelector('.ring-track')).not.toBeNull();
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])(
    'omits the progress arc when fraction is %s',
    (fraction) => {
      const { container } = render(
        <RingGauge value="98" unit="mg/dL" caption="Now" fraction={fraction} />,
      );
      expect(container.querySelector('.ring-arc')).toBeNull();
    },
  );

  it('draws the arc proportional to a finite fraction', () => {
    const { container } = render(
      <RingGauge value="98" unit="mg/dL" caption="Now" fraction={0.25} />,
    );
    const arc = container.querySelector('.ring-arc');
    expect(arc).not.toBeNull();
    const len = Number(arc!.getAttribute('data-length'));
    const circ = Number(arc!.getAttribute('data-circumference'));
    expect(len / circ).toBeCloseTo(0.25, 5);
  });

  it('clamps the drawn arc to 0..1', () => {
    const hi = render(<RingGauge value="400" unit="mg/dL" caption="Now" fraction={3} />);
    const arcHi = hi.container.querySelector('.ring-arc')!;
    expect(Number(arcHi.getAttribute('data-length'))).toBeCloseTo(
      Number(arcHi.getAttribute('data-circumference')),
      5,
    );
    hi.unmount();
    const lo = render(<RingGauge value="20" unit="mg/dL" caption="Now" fraction={-1} />);
    expect(Number(lo.container.querySelector('.ring-arc')!.getAttribute('data-length'))).toBe(0);
  });
});
