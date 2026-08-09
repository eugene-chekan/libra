/// The root widget: theme in, router in, nothing else.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme/theme.dart';

class LibraApp extends ConsumerWidget {
  const LibraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'libra',
      debugShowCheckedModeBanner: false,
      theme: buildLibraTheme(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
