import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  variant?: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple';
}

const variants = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  gray: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-800',
};

export default function Badge({ children, variant = 'gray', color }: BadgeProps) {
  return (
    <span
      className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', !color && variants[variant])}
      style={color ? { backgroundColor: color + '20', color } : undefined}
    >
      {children}
    </span>
  );
}
