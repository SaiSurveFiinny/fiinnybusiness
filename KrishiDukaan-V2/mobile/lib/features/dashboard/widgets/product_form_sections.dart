import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/data/product_schema_repository.dart';

/// Shared Add/Edit Product form sections that bring the app to parity with the
/// web dashboard's product form (app/dashboard/_components/
/// add-product-inventory-form.tsx).
///
/// These four sections existed only on web, so a product created in the app
/// silently lacked the structured detail a web-created one had — and the app's
/// own product page had nothing to render. Field names and value shapes match
/// web exactly so either platform can read the other's products.

// ── Section shell ────────────────────────────────────────────────────────────

class ProductFormSection extends StatelessWidget {
  final String title;
  final String? subtitle;
  final List<Widget> children;

  const ProductFormSection({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(
            subtitle!,
            style: AppTextStyles.bodySmall
                .copyWith(color: AppColors.onSurfaceVariant),
          ),
        ],
        const SizedBox(height: 8),
        ...children,
        const SizedBox(height: 16),
      ],
    );
  }
}

InputDecoration _fieldDecoration(String? hint) => InputDecoration(
      hintText: hint,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    );

// ── Category Info ────────────────────────────────────────────────────────────

/// Renders the per-category structured fields defined in
/// `settings/productSchema` (Pesticides → Active Ingredient, Seeds → Variety
/// Name, …). Values are written to the product's `categoryInfo` map.
///
/// A `chips` field stores a `List<String>`; every other type stores a plain
/// `String` — matching web's CHIPS_FIELDS handling.
class CategoryInfoSection extends StatelessWidget {
  final ProductSchema schema;
  final String category;

  /// Current values, keyed by field key. Chips entries hold `List<String>`.
  final Map<String, dynamic> values;
  final void Function(String key, dynamic value) onChanged;

  const CategoryInfoSection({
    super.key,
    required this.schema,
    required this.category,
    required this.values,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final fields = schema.fieldsFor(category);
    if (fields.isEmpty) return const SizedBox.shrink();

    return ProductFormSection(
      title: 'Category Info',
      subtitle: 'Details specific to $category',
      children: [
        for (final field in fields) ...[
          Text(field.label, style: AppTextStyles.bodySmall),
          const SizedBox(height: 4),
          if (field.isChips)
            _ChipsField(
              // Rebuild the editor when the category changes so a stale value
              // from the previous category can't linger in the text box.
              key: ValueKey('$category:${field.key}'),
              placeholder: field.placeholder,
              values: (values[field.key] as List?)
                      ?.map((e) => e.toString())
                      .toList() ??
                  const [],
              onChanged: (list) => onChanged(field.key, list),
            )
          else
            TextFormField(
              key: ValueKey('$category:${field.key}'),
              initialValue: values[field.key]?.toString() ?? '',
              maxLines: field.isTextarea ? 3 : 1,
              decoration: _fieldDecoration(field.placeholder),
              onChanged: (v) => onChanged(field.key, v),
            ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

/// Comma/enter separated tag input for a `chips` field.
class _ChipsField extends StatefulWidget {
  final List<String> values;
  final String? placeholder;
  final ValueChanged<List<String>> onChanged;

  const _ChipsField({
    super.key,
    required this.values,
    required this.onChanged,
    this.placeholder,
  });

  @override
  State<_ChipsField> createState() => _ChipsFieldState();
}

class _ChipsFieldState extends State<_ChipsField> {
  late List<String> _values = List<String>.from(widget.values);
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _commit(String raw) {
    // Accept a whole comma-separated paste as well as one-at-a-time entry.
    final parts = raw
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty && !_values.contains(e));
    if (parts.isEmpty) {
      _ctrl.clear();
      return;
    }
    setState(() => _values = [..._values, ...parts]);
    _ctrl.clear();
    widget.onChanged(_values);
  }

  void _remove(String value) {
    setState(() => _values = _values.where((v) => v != value).toList());
    widget.onChanged(_values);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_values.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final v in _values)
                  Chip(
                    label: Text(v, style: AppTextStyles.bodySmall),
                    onDeleted: () => _remove(v),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
              ],
            ),
          ),
        TextField(
          controller: _ctrl,
          decoration: _fieldDecoration(widget.placeholder),
          textInputAction: TextInputAction.done,
          onSubmitted: _commit,
          // Committing on focus loss too, so a value typed and then tapped
          // away from isn't silently dropped on save.
          onTapOutside: (_) {
            if (_ctrl.text.trim().isNotEmpty) _commit(_ctrl.text);
            FocusScope.of(context).unfocus();
          },
        ),
      ],
    );
  }
}

// ── Repeating name/value rows (Composition + Additional Information) ─────────

/// One editable {keyName: …, valueName: …} pair list.
///
/// Backs both Composition (`{name, value}`) and Additional Information
/// (`{title, value}`) — same UI, different key names, matching web's separate
/// CompositionEditor and CustomFieldsEditor components.
class KeyValueRowsSection extends StatefulWidget {
  final String title;
  final String? subtitle;
  final String keyName;
  final String valueName;
  final String keyLabel;
  final String valueLabel;
  final String addLabel;
  final List<Map<String, String>> rows;
  final ValueChanged<List<Map<String, String>>> onChanged;

  const KeyValueRowsSection({
    super.key,
    required this.title,
    this.subtitle,
    required this.keyName,
    required this.valueName,
    required this.keyLabel,
    required this.valueLabel,
    required this.addLabel,
    required this.rows,
    required this.onChanged,
  });

  @override
  State<KeyValueRowsSection> createState() => _KeyValueRowsSectionState();
}

class _KeyValueRowsSectionState extends State<KeyValueRowsSection> {
  late final List<Map<String, String>> _rows = widget.rows.isEmpty
      ? []
      : widget.rows.map((r) => Map<String, String>.from(r)).toList();

  void _emit() {
    // Only rows with a label are meaningful — a half-typed blank row must not
    // reach Firestore. Web applies the same filter before saving.
    widget.onChanged(
      _rows
          .where((r) => (r[widget.keyName] ?? '').trim().isNotEmpty)
          .map((r) => {
                widget.keyName: (r[widget.keyName] ?? '').trim(),
                widget.valueName: (r[widget.valueName] ?? '').trim(),
              })
          .toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ProductFormSection(
      title: widget.title,
      subtitle: widget.subtitle,
      children: [
        for (var i = 0; i < _rows.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    key: ValueKey('${widget.keyName}_k_$i'),
                    initialValue: _rows[i][widget.keyName] ?? '',
                    decoration: _fieldDecoration(widget.keyLabel),
                    onChanged: (v) {
                      _rows[i][widget.keyName] = v;
                      _emit();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: TextFormField(
                    key: ValueKey('${widget.keyName}_v_$i'),
                    initialValue: _rows[i][widget.valueName] ?? '',
                    decoration: _fieldDecoration(widget.valueLabel),
                    onChanged: (v) {
                      _rows[i][widget.valueName] = v;
                      _emit();
                    },
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  color: AppColors.onSurfaceVariant,
                  onPressed: () {
                    setState(() => _rows.removeAt(i));
                    _emit();
                  },
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(
              () => _rows.add({widget.keyName: '', widget.valueName: ''}),
            ),
            icon: const Icon(Icons.add, size: 18),
            label: Text(widget.addLabel),
          ),
        ),
      ],
    );
  }
}

// ── Product video ────────────────────────────────────────────────────────────

/// Extracts a YouTube video id from any of the URL shapes web accepts.
/// Mirrors extractYouTubeId in web's add-product form; returns null when the
/// input isn't a recognisable YouTube link.
String? extractYouTubeId(String? url) {
  if (url == null) return null;
  final trimmed = url.trim();
  if (trimmed.isEmpty) return null;
  final match = RegExp(
    r'(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})',
  ).firstMatch(trimmed);
  return match?.group(1);
}

class ProductVideoSection extends StatelessWidget {
  final String initialValue;
  final ValueChanged<String> onChanged;

  const ProductVideoSection({
    super.key,
    required this.initialValue,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return ProductFormSection(
      title: 'Product Video (Optional)',
      subtitle: 'YouTube link shown as "See it in action" on the product page',
      children: [
        TextFormField(
          initialValue: initialValue,
          decoration: _fieldDecoration('https://www.youtube.com/watch?v=...'),
          keyboardType: TextInputType.url,
          onChanged: onChanged,
          // Empty is fine (the field is optional), but a non-empty value that
          // isn't a YouTube link would render nothing on the product page —
          // so it's rejected here rather than saved and silently ignored.
          validator: (v) {
            final value = (v ?? '').trim();
            if (value.isEmpty) return null;
            return extractYouTubeId(value) == null
                ? 'Enter a valid YouTube link'
                : null;
          },
        ),
      ],
    );
  }
}
