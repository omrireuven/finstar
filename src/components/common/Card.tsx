import clsx from 'clsx';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export default function Card({ className, children, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'card-base bg-white rounded-2xl p-5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
