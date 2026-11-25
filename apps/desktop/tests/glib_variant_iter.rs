#![cfg(target_os = "linux")]

use glib::{prelude::ToVariant, Variant};

#[test]
fn reads_a_string_array_in_both_directions() {
    let names = ["EUR/USD", "日本株", "Energy", "Gold"];
    let array = Variant::array_from_iter::<String>(names.map(|name| name.to_variant()));
    let mut values = array.array_iter_str().expect("a GLib string array");
    assert_eq!(values.next(), Some(names[0]));
    assert_eq!(values.next_back(), Some(names[3]));
    assert_eq!(values.collect::<Vec<_>>(), &names[1..3]);
}
