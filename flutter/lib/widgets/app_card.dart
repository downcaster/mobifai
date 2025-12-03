import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Styled card container
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool selected;
  final bool connecting;
  final BorderRadius? borderRadius;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.selected = false,
    this.connecting = false,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? BorderRadius.circular(16);

    return Container(
      margin: margin ?? const EdgeInsets.only(bottom: 12),
      child: Material(
        color: _getBackgroundColor(),
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            padding: padding ?? const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(
                color: _getBorderColor(),
                width: selected || connecting ? 1.5 : 1,
              ),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.4),
                        blurRadius: 8,
                      ),
                    ]
                  : null,
            ),
            child: child,
          ),
        ),
      ),
    );
  }

  Color _getBackgroundColor() {
    if (selected) return AppColors.accentSelected;
    if (connecting) return AppColors.connectingGlow;
    return AppColors.bgCard;
  }

  Color _getBorderColor() {
    if (selected) return AppColors.borderSelected;
    if (connecting) return AppColors.borderConnecting;
    return AppColors.borderSubtle;
  }
}

