import PropTypes from "prop-types";

/**
 * Routiform mark — hex mesh hub (six paths into one gateway).
 * Geometry matches public/favicon.svg and app icons (viewBox 0 0 32 32).
 */
export default function RoutiformLogo({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="1.15" strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="6" />
        <line x1="16" y1="16" x2="24.66" y2="11" />
        <line x1="16" y1="16" x2="24.66" y2="21" />
        <line x1="16" y1="16" x2="16" y2="26" />
        <line x1="16" y1="16" x2="7.34" y2="21" />
        <line x1="16" y1="16" x2="7.34" y2="11" />
      </g>
      <circle cx="16" cy="6" r="2" fill="currentColor" />
      <circle cx="24.66" cy="11" r="2" fill="currentColor" />
      <circle cx="24.66" cy="21" r="2" fill="currentColor" />
      <circle cx="16" cy="26" r="2" fill="currentColor" />
      <circle cx="7.34" cy="21" r="2" fill="currentColor" />
      <circle cx="7.34" cy="11" r="2" fill="currentColor" />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  );
}

RoutiformLogo.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
