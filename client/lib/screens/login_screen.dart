/// Route `/login`. No sidebar; the whole viewport is `bg`.
///
/// The form, the credential round-trip and the `?next=` return are #25. What is
/// settled here is the frame the design specifies — centred card on `bg`,
/// outside the shell — so the router has a real route to redirect an expired
/// session to rather than a placeholder inside the sidebar.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/empty_state.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LibraColors.bg,
      body: Center(
        child: Container(
          width: 380,
          padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 32),
          decoration: BoxDecoration(
            color: LibraColors.card,
            borderRadius: BorderRadius.circular(LibraRadius.modal),
            border: Border.all(color: LibraColors.border),
          ),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('libra', style: LibraText.logo),
              LibraEmptyState(
                title: 'Not built yet',
                message: 'Sign-in arrives with #25.',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
