import clsx from 'clsx';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  compact?: boolean;
}

export default function Card({ className, children, onClick, compact }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'card-base bg-white rounded-2xl',
        compact ? 'p-3' : 'p-5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
