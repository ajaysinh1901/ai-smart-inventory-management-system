import {
  AlertTriangle, PackageX, TrendingUp, TrendingDown, Timer, Package,
  CheckCircle, AlertCircle, Activity, Star, Clock, Lightbulb,
  ShoppingCart, ArrowDown, ArrowUp,
} from 'lucide-react';

const iconMap = {
  warning_amber:           AlertTriangle,
  warning:                 AlertTriangle,
  remove_shopping_cart:    PackageX,
  trending_up:             TrendingUp,
  trending_down:           TrendingDown,
  hourglass_disabled:      Timer,
  inventory_2:             Package,
  check_circle:            CheckCircle,
  error:                   AlertCircle,
  smart_toy:               Activity,
  star:                    Star,
  schedule:                Clock,
  lightbulb:               Lightbulb,
  shopping_cart:           ShoppingCart,
  arrow_downward:          ArrowDown,
  arrow_upward:            ArrowUp,
};

export function DynamicIcon({ name, size = 18, className = '' }) {
  const Icon = iconMap[name];
  if (!Icon) return <Package size={size} className={className} />;
  return <Icon size={size} className={className} />;
}

export default iconMap;
