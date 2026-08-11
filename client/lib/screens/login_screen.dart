/// Route `/login`. No sidebar; the whole viewport is `bg`.
///
/// The error copy is the load-bearing detail. It is **"Incorrect username or
/// password."** and never says which — not vagueness for its own sake, but
/// because `auth.authenticate` verifies an unknown username against a dummy
/// Argon2 hash specifically so response timing cannot reveal whether an account
/// exists. A message saying "no such user" would hand back, in plain text,
/// exactly what the backend spends effort concealing.
///
/// No "remember me", "forgot password" or "create account": self-registration
/// and password reset are explicit non-goals in architecture.md, and a dead
/// affordance is worse than none.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../session/session.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      !_submitting &&
      _username.text.trim().isNotEmpty &&
      _password.text.isNotEmpty;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(sessionProvider.notifier)
          .signIn(username: _username.text.trim(), password: _password.text);
      // The router's redirect takes it from here: it sees an authenticated
      // session sitting on /login and forwards to `next`, or to `/`.
    } on Unauthorized {
      setState(() => _error = 'Incorrect username or password.');
    } on ApiException catch (e) {
      // A NetworkFailure shown as "wrong password" would send the reader
      // hunting for a typo when the server is simply not running.
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Read from the session, not from `?next=`. The address bar records where
    // the reader was going; only the session knows whether anything ended.
    final expired = ref.watch(sessionProvider).expired;

    return Scaffold(
      backgroundColor: LibraColors.bg,
      body: Center(
        child: SingleChildScrollView(
          child: Container(
            width: 380,
            padding: const EdgeInsets.all(40),
            decoration: BoxDecoration(
              color: LibraColors.card,
              borderRadius: BorderRadius.circular(LibraRadius.modal),
              // The dropdown shadow, not the modal one: a modal shadow is too
              // heavy for a page with nothing behind it.
              boxShadow: LibraShadows.dropdown,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 32),
                  child: Text(
                    'Libra',
                    style: LibraText.detailTitle,
                    textAlign: TextAlign.center,
                  ),
                ),
                if (expired)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 20),
                    child: Text(
                      'Your session expired. Please sign in again.',
                      style: TextStyle(
                        fontFamily: LibraFonts.sans,
                        fontSize: 13,
                        color: LibraColors.textMid,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                _Field(
                  label: 'Username',
                  controller: _username,
                  autofocus: true,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 18),
                _Field(
                  label: 'Password',
                  controller: _password,
                  obscure: true,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) _ErrorLine(message: _error!),
                const SizedBox(height: 24),
                _SubmitButton(
                  enabled: _canSubmit,
                  busy: _submitting,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    required this.onChanged,
    required this.onSubmitted,
    this.obscure = false,
    this.autofocus = false,
  });

  final String label;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final bool obscure;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: LibraText.fieldLabel),
        const SizedBox(height: 6),
        SizedBox(
          height: 42,
          child: TextField(
            controller: controller,
            autofocus: autofocus,
            // No reveal toggle: one more control on a two-field form, guarding
            // a value the reader just typed.
            obscureText: obscure,
            onChanged: onChanged,
            // Enter submits from either field, rather than only from the last.
            onSubmitted: onSubmitted,
            textInputAction: TextInputAction.go,
            style: LibraText.body,
          ),
        ),
      ],
    );
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 14, color: LibraColors.danger),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontFamily: LibraFonts.sans,
                fontSize: 13,
                color: LibraColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Disabled while either field is empty, matching the Add Book modal exactly:
/// `border` fill, `textLight` label, default cursor, and a press that does
/// nothing rather than a form that submits and fails.
class _SubmitButton extends StatelessWidget {
  const _SubmitButton({
    required this.enabled,
    required this.busy,
    required this.onPressed,
  });

  final bool enabled;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 42,
      child: FilledButton(
        onPressed: enabled ? onPressed : null,
        child: busy
            // Inside the control that started it, which is the app's rule for
            // spinners: skeletons are for content arriving, spinners for
            // actions the reader took.
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: LibraColors.card,
                ),
              )
            : const Text('Sign In'),
      ),
    );
  }
}
