import React from 'react';

interface SendPlaneIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

/**
 * Solid WhatsApp / Material style send airplane icon
 * Perfectly symmetrical on horizontal axis y=12, pointing straight to the right (0 deg)
 * with the iconic paper plane fold notch and optical center alignment.
 */
export const SendPlaneIcon: React.FC<SendPlaneIconProps> = ({
  size = 18,
  className = '',
  ...props
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 translate-x-[1px] ${className}`}
      {...props}
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
};
