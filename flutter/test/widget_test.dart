import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobifai/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const MobiFaiApp());

    // Verify that the app loads
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
