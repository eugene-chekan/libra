import 'dart:js_interop';
import 'dart:typed_data';

import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

/// `withCredentials` is what sends the `libra_session` cookie cross-origin.
///
/// Only needed when the client is served from somewhere other than the API. In
/// the packaged single-origin run it is harmless; in the split dev setup it is
/// essential, and it only works when the server names that exact origin in
/// `LIBRA_CORS_ORIGINS` — the CORS spec forbids credentialed requests against a
/// `*` origin, and the browser rejects the response rather than warning.
http.Client createHttpClient() => BrowserClient()..withCredentials = true;

/// The origin the page itself was loaded from.
///
/// This is what makes the app work from any device on the network without
/// being rebuilt. The API address cannot be baked in at compile time and still
/// be right for everyone: a phone opening `http://192.168.1.10:8000` would
/// otherwise call `localhost`, meaning *its own* device. Reading it from
/// `Uri.base` means the answer is always "wherever this page came from".
String defaultApiBaseUrl() => Uri.base.origin;

/// Hands [bytes] to the browser as a download named [filename].
///
/// The bytes are fetched through the credentialed client and handed over as a
/// blob rather than navigating to the endpoint. Navigation would work in the
/// packaged single-origin run and is a coin toss in the split dev setup, where
/// whether the cookie rides along depends on `SameSite` and how the browser
/// classifies the hop. Fetching is the same path covers already take, and it
/// behaves identically wherever the API lives.
void saveFile(Uint8List bytes, String filename) {
  final blob = web.Blob(
    [bytes.toJS].toJS,
    web.BlobPropertyBag(type: 'application/epub+zip'),
  );
  final url = web.URL.createObjectURL(blob);
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = filename
    ..style.display = 'none';
  web.document.body!.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Released once the download has been handed off; the blob would otherwise
  // pin the whole file in memory for the life of the page.
  web.URL.revokeObjectURL(url);
}
