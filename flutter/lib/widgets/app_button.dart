import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Primary app button with consistent styling
class AppButton extends StatelessWidget {
  final String title;
  final VoidCallback? onPressed;
  final bool loading;
  final bool disabled;
  final IconData? icon;
  final ButtonVariant variant;

  const AppButton({
    super.key,
    required this.title,
    this.onPressed,
    this.loading = false,
    this.disabled = false,
    this.icon,
    this.variant = ButtonVariant.primary,
  });

  @override
  Widget build(BuildContext context) {
    final isDisabled = disabled || loading;

    return Opacity(
      opacity: isDisabled ? 0.5 : 1.0,
      child: Container(
        decoration: variant == ButtonVariant.primary
            ? BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              )
            : null,
        child: ElevatedButton(
          onPressed: isDisabled ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: _getBackgroundColor(),
            foregroundColor: _getForegroundColor(),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: variant == ButtonVariant.outline
                  ? const BorderSide(color: AppColors.borderSubtle)
                  : BorderSide.none,
            ),
            elevation: 0,
          ),
          child: loading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      _getForegroundColor(),
                    ),
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 20),
                      const SizedBox(width: 8),
                    ],
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Color _getBackgroundColor() {
    switch (variant) {
      case ButtonVariant.primary:
        return AppColors.primary;
      case ButtonVariant.secondary:
        return AppColors.bgTertiary;
      case ButtonVariant.outline:
        return Colors.transparent;
      case ButtonVariant.ghost:
        return Colors.transparent;
    }
  }

  Color _getForegroundColor() {
    switch (variant) {
      case ButtonVariant.primary:
        return AppColors.textPrimary;
      case ButtonVariant.secondary:
        return AppColors.textSecondary;
      case ButtonVariant.outline:
        return AppColors.textSecondary;
      case ButtonVariant.ghost:
        return AppColors.secondary;
    }
  }
}

enum ButtonVariant {
  primary,
  secondary,
  outline,
  ghost,
}

