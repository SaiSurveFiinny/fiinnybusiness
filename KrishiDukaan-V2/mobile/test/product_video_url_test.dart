import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/dashboard/widgets/product_form_sections.dart';

/// The Add Product form blocks saving when a non-empty video URL doesn't yield
/// an id, so these cases decide whether a seller can save at all.
void main() {
  group('extractYouTubeId (must match web extractYouTubeId)', () {
    test('standard watch URL', () {
      expect(
        extractYouTubeId('https://www.youtube.com/watch?v=_xJWOoUoLhM'),
        '_xJWOoUoLhM',
      );
    });

    test('short youtu.be URL', () {
      expect(extractYouTubeId('https://youtu.be/_xJWOoUoLhM'), '_xJWOoUoLhM');
    });

    test('embed URL', () {
      expect(
        extractYouTubeId('https://www.youtube.com/embed/_xJWOoUoLhM'),
        '_xJWOoUoLhM',
      );
    });

    test('shorts URL', () {
      expect(
        extractYouTubeId('https://www.youtube.com/shorts/_xJWOoUoLhM'),
        '_xJWOoUoLhM',
      );
    });

    test('extra query params after the id still resolve', () {
      expect(
        extractYouTubeId('https://www.youtube.com/watch?v=_xJWOoUoLhM&t=30s'),
        '_xJWOoUoLhM',
      );
    });

    test('surrounding whitespace is tolerated', () {
      expect(
        extractYouTubeId('  https://youtu.be/_xJWOoUoLhM  '),
        '_xJWOoUoLhM',
      );
    });

    test('null and empty are not errors — the field is optional', () {
      expect(extractYouTubeId(null), isNull);
      expect(extractYouTubeId(''), isNull);
      expect(extractYouTubeId('   '), isNull);
    });

    test('a non-YouTube link is rejected rather than saved unusable', () {
      expect(extractYouTubeId('https://vimeo.com/123456'), isNull);
      expect(extractYouTubeId('not a url'), isNull);
    });

    test('an id of the wrong length is rejected', () {
      expect(extractYouTubeId('https://youtu.be/tooshort'), isNull);
    });
  });
}
