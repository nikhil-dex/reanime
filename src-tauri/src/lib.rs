use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashSet},
    fs, io,
    path::{Component, Path, PathBuf},
};
use tauri::Manager;
use tempfile::TempDir;
use zip::ZipArchive;

const LIBRARY_NAME: &str = "characters";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPackage {
    pub package_id: String,
    pub version: String,
    pub character_id: String,
    pub display_name: String,
    pub architecture: Option<String>,
    pub canvas: Option<Value>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub preview_path: Option<String>,
    pub installed_path: String,
    pub imported_at: u64,
    pub source: String,
    pub status: String,
    pub error: Option<String>,
    pub manifest: Value,
    pub body_pose_count: usize,
    pub face_variant_count: usize,
    pub mouth_variant_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageValidation {
    pub valid: bool,
    pub package_id: Option<String>,
    pub version: Option<String>,
    pub errors: Vec<String>,
}

fn library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LIBRARY_NAME))
        .map_err(|error| format!("unable to determine app data directory: {error}"))
}

fn ensure_library(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = library_dir(app)?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("unable to create character library: {error}"))?;
    Ok(path)
}

fn read_manifest(path: &Path) -> Result<Value, String> {
    let bytes = fs::read(path).map_err(|error| format!("unable to read manifest: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("manifest is not valid JSON: {error}"))
}

fn validate_manifest(manifest: &Value) -> PackageValidation {
    let mut errors = Vec::new();
    let package_id = manifest
        .get("package_id")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_owned);
    if manifest.get("schema_version").and_then(Value::as_str) != Some("1.0") {
        errors.push("unsupported character package schema; expected schema_version '1.0' (layered PNG state compositor)".into());
    }
    if package_id
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
        || !package_id
            .as_deref()
            .is_some_and(|value| valid_identifier(value))
    {
        errors.push("package_id must be a non-empty stable identifier containing only letters, numbers, '_' or '-'".into());
    }
    if !version.as_deref().is_some_and(|value| {
        let mut parts = value.split('.');
        parts.clone().count() == 3
            && parts.all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
    }) {
        errors.push("version must be a semantic version in MAJOR.MINOR.PATCH form".into());
    }
    let allowed_fields = [
        "schema_version",
        "package_id",
        "version",
        "name",
        "display_name",
        "description",
        "author",
        "canvas",
        "rig",
        "states",
        "default_state",
        "counts",
        "assets",
    ];
    if let Some(fields) = manifest.as_object() {
        for field in fields
            .keys()
            .filter(|field| !allowed_fields.contains(&field.as_str()))
        {
            errors.push(format!("unsupported manifest field '{field}'; use the canonical layered PNG state-compositor format"));
        }
    } else {
        errors.push("manifest root must be a JSON object".into());
    }
    let canvas = manifest.get("canvas");
    if !canvas.is_some_and(|value| {
        value
            .get("width")
            .and_then(Value::as_u64)
            .is_some_and(|width| width > 0)
            && value
                .get("height")
                .and_then(Value::as_u64)
                .is_some_and(|height| height > 0)
            && value.get("color_space").and_then(Value::as_str) == Some("RGBA")
            && value.get("background").and_then(Value::as_str) == Some("transparent")
    }) {
        errors.push("canvas must define positive width/height, color_space 'RGBA', and background 'transparent'".into());
    }
    if let Some(fields) = canvas.and_then(Value::as_object) {
        for field in fields.keys().filter(|field| {
            !["width", "height", "color_space", "background"].contains(&field.as_str())
        }) {
            errors.push(format!("unsupported canvas field '{field}'"));
        }
    }
    for field in ["name", "display_name", "description", "author"] {
        if manifest.get(field).is_some_and(|value| !value.is_string()) {
            errors.push(format!("manifest field '{field}' must be a string"));
        }
    }
    validate_canonical_structure(manifest, &mut errors);
    PackageValidation {
        valid: errors.is_empty(),
        package_id,
        version,
        errors,
    }
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

fn state_group<'a>(manifest: &'a Value, group: &str) -> Option<&'a serde_json::Map<String, Value>> {
    manifest.get("states")?.get(group)?.as_object()
}

fn layer_by_id<'a>(manifest: &'a Value, id: &str) -> Option<&'a Value> {
    manifest
        .get("rig")?
        .get("layers")?
        .as_array()?
        .iter()
        .find(|layer| layer.get("id").and_then(Value::as_str) == Some(id))
}

fn declared_layer_assets(manifest: &Value, id: &str) -> Option<BTreeSet<String>> {
    Some(
        layer_by_id(manifest, id)?
            .get("assets")?
            .as_array()?
            .iter()
            .map(|value| value.as_str().map(str::to_owned))
            .collect::<Option<BTreeSet<_>>>()?,
    )
}

fn validate_canonical_structure(manifest: &Value, errors: &mut Vec<String>) {
    let rig = manifest.get("rig");
    if rig
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        != Some("state_compositor")
    {
        errors.push(
            "rig.type must be 'state_compositor'; skeletal and external rigs are unsupported"
                .into(),
        );
    }
    if let Some(rig) = rig.and_then(Value::as_object) {
        for key in rig
            .keys()
            .filter(|key| !["type", "layers", "notes"].contains(&key.as_str()))
        {
            errors.push(format!("unsupported rig field '{key}'"));
        }
    }
    let expected_layers = [
        ("body", "pose_state"),
        ("headGroup", "container"),
        ("head", "base_art"),
        ("face", "expression_state"),
        ("mouth", "mouth_state"),
    ];
    let layers = rig
        .and_then(|value| value.get("layers"))
        .and_then(Value::as_array);
    if layers.is_none() {
        errors.push("rig.layers must be the canonical array of body, headGroup, head, face, and mouth layers".into());
    } else {
        let layers = layers.unwrap();
        let ids: Vec<_> = layers
            .iter()
            .filter_map(|layer| layer.get("id").and_then(Value::as_str))
            .collect();
        let expected_ids: Vec<_> = expected_layers.iter().map(|(id, _)| *id).collect();
        if ids != expected_ids {
            errors.push("rig.layers must contain exactly body, headGroup, head, face, and mouth in canonical order; independent hands/arms and arbitrary layers are unsupported".into());
        }
        for (id, kind) in expected_layers {
            if let Some(layer) = layer_by_id(manifest, id) {
                if layer.get("type").and_then(Value::as_str) != Some(kind)
                    || layer.get("required").and_then(Value::as_bool) != Some(true)
                {
                    errors.push(format!(
                        "rig layer '{id}' must be required with type '{kind}'"
                    ));
                }
                let allowed = if id == "face" {
                    vec!["id", "type", "required", "composition", "assets"]
                } else if id == "headGroup" {
                    vec!["id", "type", "required", "children"]
                } else {
                    vec!["id", "type", "required", "assets"]
                };
                if let Some(fields) = layer.as_object() {
                    for field in fields
                        .keys()
                        .filter(|field| !allowed.contains(&field.as_str()))
                    {
                        errors.push(format!("unsupported field '{field}' in rig layer '{id}'"));
                    }
                }
            } else {
                errors.push(format!("required rig layer '{id}' is missing"));
            }
        }
        if layer_by_id(manifest, "headGroup")
            .and_then(|layer| layer.get("children"))
            .and_then(Value::as_array)
            .and_then(|children| {
                children
                    .iter()
                    .map(Value::as_str)
                    .collect::<Option<Vec<_>>>()
            })
            .as_deref()
            != Some(["head", "face", "mouth"].as_slice())
        {
            errors.push(
                "rig layer 'headGroup' children must be exactly ['head', 'face', 'mouth']".into(),
            );
        }
        if layer_by_id(manifest, "face")
            .and_then(|layer| layer.get("composition"))
            .and_then(Value::as_str)
            != Some("eyes_and_eyebrows_combined")
        {
            errors.push("rig layer 'face' composition must be 'eyes_and_eyebrows_combined'".into());
        }
    }

    let expected_groups = ["body", "face", "mouth"];
    if let Some(states) = manifest.get("states").and_then(Value::as_object) {
        for group in states
            .keys()
            .filter(|group| !expected_groups.contains(&group.as_str()))
        {
            errors.push(format!("unsupported state group '{group}'"));
        }
    } else {
        errors.push("states must contain body, face, and mouth maps".into());
    }
    for group in expected_groups {
        let Some(states) = state_group(manifest, group) else {
            errors.push(format!(
                "states.{group} must map stable state IDs to PNG paths"
            ));
            continue;
        };
        if states.is_empty() {
            errors.push(format!("states.{group} must contain at least one state"));
        }
        for (state, path) in states {
            let Some(path) = path.as_str() else {
                errors.push(format!("states.{group}.{state} must be a PNG path"));
                continue;
            };
            let prefix = match group {
                "body" => "body/",
                "face" => "face/",
                _ => "mouth/",
            };
            if !valid_identifier(state)
                || !path.starts_with(prefix)
                || !path.to_ascii_lowercase().ends_with(".png")
            {
                errors.push(format!(
                    "states.{group}.{state} must use a stable state ID and a {prefix} PNG path"
                ));
            }
        }
    }
    let Some(defaults) = manifest.get("default_state").and_then(Value::as_object) else {
        errors.push("default_state must select body, face, and mouth state IDs".into());
        return;
    };
    if defaults.len() != expected_groups.len()
        || expected_groups.iter().any(|group| {
            defaults
                .get(*group)
                .and_then(Value::as_str)
                .zip(state_group(manifest, group))
                .is_none_or(|(state, states)| !states.contains_key(state))
        })
    {
        errors.push(
            "default_state must select an existing state in each of body, face, and mouth".into(),
        );
    }

    let mut expected_assets = BTreeSet::new();
    for group in expected_groups {
        if let Some(states) = state_group(manifest, group) {
            for (state, path) in states {
                if let Some(path) = path.as_str() {
                    expected_assets.insert((path.to_owned(), group.to_owned(), state.clone()));
                }
            }
        }
    }
    if let Some(head) = layer_by_id(manifest, "head")
        .and_then(|layer| layer.get("assets"))
        .and_then(Value::as_array)
    {
        if head.len() != 1 || head[0].as_str().is_none() {
            errors.push(
                "the head layer must reference exactly one faceless head-and-hair PNG".into(),
            );
        } else if let Some(path) = head[0].as_str() {
            if !path.starts_with("head/") || !path.to_ascii_lowercase().ends_with(".png") {
                errors.push("the head layer asset must be a PNG under head/".into());
            }
            expected_assets.insert((path.to_owned(), "head".into(), "head".into()));
        }
    } else {
        errors.push("the head layer must reference its PNG in an assets array".into());
    }
    for (id, group) in [("body", "body"), ("face", "face"), ("mouth", "mouth")] {
        let states = state_group(manifest, group);
        let mapped: BTreeSet<_> = states
            .into_iter()
            .flat_map(|values| values.values())
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect();
        if declared_layer_assets(manifest, id).as_ref() != Some(&mapped) {
            errors.push(format!(
                "rig layer '{id}' assets must exactly match states.{group}"
            ));
        }
    }
    let head_assets = declared_layer_assets(manifest, "head");
    let head_state = expected_assets
        .iter()
        .find(|(_, layer, _)| layer == "head")
        .map(|(path, _, _)| path.clone());
    if head_assets != head_state.map(|path| BTreeSet::from([path])) {
        errors.push("rig layer 'head' assets must exactly match its head PNG".into());
    }
    let Some(registry) = manifest.get("assets").and_then(Value::as_object) else {
        errors.push("assets must be a flat registry keyed by PNG path".into());
        return;
    };
    let expected_paths: BTreeSet<_> = expected_assets
        .iter()
        .map(|(path, _, _)| path.clone())
        .collect();
    if registry.keys().cloned().collect::<BTreeSet<_>>() != expected_paths {
        errors.push("assets registry must contain exactly the PNGs referenced by body, head, face, and mouth states".into());
    }
    for (path, layer, state) in expected_assets {
        let Some(metadata) = registry.get(&path).and_then(Value::as_object) else {
            errors.push(format!(
                "assets.{path} must define path, layer, state, and type metadata"
            ));
            continue;
        };
        let allowed = ["path", "layer", "state", "type"];
        for key in metadata
            .keys()
            .filter(|key| !allowed.contains(&key.as_str()))
        {
            errors.push(format!(
                "unsupported metadata field '{key}' in assets.{path}"
            ));
        }
        if metadata.get("path").and_then(Value::as_str) != Some(path.as_str())
            || metadata.get("layer").and_then(Value::as_str) != Some(layer.as_str())
            || metadata.get("state").and_then(Value::as_str) != Some(state.as_str())
            || metadata.get("type").and_then(Value::as_str) != Some("png")
        {
            errors.push(format!(
                "assets.{path} metadata must match its path, layer, state, and PNG type"
            ));
        }
    }
}

fn validate_asset_references(package_root: &Path, references: &[String]) -> Result<(), String> {
    let canonical_root = package_root
        .canonicalize()
        .map_err(|error| format!("unable to resolve package root: {error}"))?;
    for asset in references {
        let relative = safe_zip_path(asset)?;
        let candidate = package_root.join(relative);
        let resolved = match candidate.canonicalize() {
            Ok(path) => path,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(format!("manifest references missing asset: {asset}"));
            }
            Err(error) => {
                return Err(format!(
                    "unable to resolve manifest asset '{asset}': {error}"
                ));
            }
        };
        if !resolved.starts_with(&canonical_root) {
            return Err(format!("manifest asset escapes package directory: {asset}"));
        }
        if !resolved.is_file() {
            return Err(format!("manifest references missing asset: {asset}"));
        }
        let file = fs::File::open(&resolved)
            .map_err(|error| format!("unable to read PNG asset '{asset}': {error}"))?;
        let decoder = png::Decoder::new(file);
        let mut reader = decoder
            .read_info()
            .map_err(|error| format!("asset '{asset}' is not a readable PNG: {error}"))?;
        let mut buffer = vec![0; reader.output_buffer_size()];
        reader
            .next_frame(&mut buffer)
            .map_err(|error| format!("asset '{asset}' has invalid PNG image data: {error}"))?;
    }
    Ok(())
}

fn validate_calibration(
    path: &Path,
    package_id: &str,
    version: &str,
    canvas: &Value,
) -> Result<(), String> {
    let calibration_path = path.join("calibration.json");
    let calibration: Value = serde_json::from_slice(
        &fs::read(&calibration_path)
            .map_err(|error| format!("unable to read calibration.json: {error}"))?,
    )
    .map_err(|error| format!("calibration.json is not valid JSON: {error}"))?;
    if let Some(fields) = calibration.as_object() {
        for field in fields.keys().filter(|field| {
            ![
                "schema_version",
                "package_id",
                "version",
                "canvas",
                "layers",
                "notes",
            ]
            .contains(&field.as_str())
        }) {
            return Err(format!("unsupported calibration field '{field}'"));
        }
    }
    if calibration
        .get("notes")
        .is_some_and(|notes| !notes.is_string())
    {
        return Err("calibration.json notes must be a string".into());
    }
    let calibration_canvas = calibration.get("canvas").and_then(Value::as_object);
    let canvas_width = canvas.get("width").and_then(Value::as_u64);
    let canvas_height = canvas.get("height").and_then(Value::as_u64);
    let canvas_matches = calibration_canvas.is_some_and(|calibration_canvas| {
        calibration_canvas.len() == 2
            && calibration_canvas.get("width").and_then(Value::as_u64) == canvas_width
            && calibration_canvas.get("height").and_then(Value::as_u64) == canvas_height
    });
    if calibration.get("schema_version").and_then(Value::as_str) != Some("1.0")
        || calibration.get("package_id").and_then(Value::as_str) != Some(package_id)
        || calibration.get("version").and_then(Value::as_str) != Some(version)
        || !canvas_matches
    {
        return Err(format!("calibration.json must use schema 1.0 and match package {package_id} version {version} and canvas"));
    }
    let expected_layers = ["body", "headGroup", "head", "face", "mouth"];
    let Some(layers) = calibration.get("layers").and_then(Value::as_object) else {
        return Err(
            "calibration.json layers must define body, headGroup, head, face, and mouth transforms"
                .into(),
        );
    };
    if layers
        .keys()
        .any(|layer| !expected_layers.contains(&layer.as_str()))
        || expected_layers
            .iter()
            .any(|layer| !layers.contains_key(*layer))
    {
        return Err(
            "calibration.json layers must contain only body, headGroup, head, face, and mouth"
                .into(),
        );
    }
    for layer in expected_layers {
        let Some(transform) = layers.get(layer).and_then(Value::as_object) else {
            return Err(format!(
                "calibration.json layer '{layer}' must be a transform object"
            ));
        };
        let allowed = if layer == "headGroup" {
            vec!["x", "y", "scaleX", "scaleY", "rotation", "opacity", "pivot"]
        } else {
            vec!["x", "y", "scaleX", "scaleY", "rotation", "opacity"]
        };
        if transform.keys().any(|key| !allowed.contains(&key.as_str())) {
            return Err(format!(
                "calibration.json layer '{layer}' contains unsupported transform fields"
            ));
        }
        for key in ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] {
            if !transform
                .get(key)
                .and_then(Value::as_f64)
                .is_some_and(f64::is_finite)
            {
                return Err(format!(
                    "calibration.json layer '{layer}' field '{key}' must be a finite number"
                ));
            }
        }
        if transform
            .get("scaleX")
            .and_then(Value::as_f64)
            .is_some_and(|value| value <= 0.0)
            || transform
                .get("scaleY")
                .and_then(Value::as_f64)
                .is_some_and(|value| value <= 0.0)
            || transform
                .get("opacity")
                .and_then(Value::as_f64)
                .is_some_and(|value| !(0.0..=1.0).contains(&value))
        {
            return Err(format!("calibration.json layer '{layer}' scale must be positive and opacity must be between 0 and 1"));
        }
    }
    if let Some(pivot) = layers.get("headGroup").and_then(|layer| layer.get("pivot")) {
        let valid_keys = pivot.as_object().is_some_and(|fields| {
            fields.len() == 2 && fields.contains_key("x") && fields.contains_key("y")
        });
        if !valid_keys
            || !pivot
                .get("x")
                .and_then(Value::as_f64)
                .is_some_and(|value| value.is_finite() && (0.0..=1.0).contains(&value))
            || !pivot
                .get("y")
                .and_then(Value::as_f64)
                .is_some_and(|value| value.is_finite() && (0.0..=1.0).contains(&value))
        {
            return Err("calibration.json headGroup pivot x and y must be normalized values between 0 and 1".into());
        }
    }
    Ok(())
}

fn package_from_manifest(path: &Path) -> Result<CharacterPackage, String> {
    let manifest = read_manifest(&path.join("manifest.json"))?;
    let validation = validate_manifest(&manifest);
    if !validation.valid {
        return Err(validation.errors.join("; "));
    }
    let package_id = validation.package_id.unwrap();
    let version = validation.version.unwrap();
    let references: Vec<String> = manifest
        .get("assets")
        .and_then(Value::as_object)
        .ok_or("assets must be a flat registry keyed by PNG path")?
        .keys()
        .cloned()
        .collect();
    validate_asset_references(path, &references)?;
    let canvas = manifest.get("canvas").cloned();
    let canvas = canvas.ok_or("canonical manifest is missing canvas")?;
    validate_calibration(path, &package_id, &version, &canvas)?;
    let character_id = package_id.clone();
    let display_name = manifest
        .get("display_name")
        .and_then(Value::as_str)
        .or_else(|| manifest.get("name").and_then(Value::as_str))
        .unwrap_or("Character")
        .to_owned();
    let author = manifest
        .get("author")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let description = manifest
        .get("description")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let preview_path = fs::read_dir(path.join("preview"))
        .ok()
        .and_then(|entries| {
            entries.flatten().map(|entry| entry.path()).find(|item| {
                item.extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
            })
        })
        .map(|item| item.to_string_lossy().into_owned());
    let imported_at = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let body_pose_count = state_group(&manifest, "body").map_or(0, |states| states.len());
    let face_variant_count = state_group(&manifest, "face").map_or(0, |states| states.len());
    let mouth_variant_count = state_group(&manifest, "mouth").map_or(0, |states| states.len());
    Ok(CharacterPackage {
        package_id,
        version,
        character_id: character_id.clone(),
        display_name,
        architecture: Some("Layered PNG state compositor".into()),
        canvas: Some(canvas),
        author,
        description,
        preview_path,
        installed_path: path.to_string_lossy().into_owned(),
        imported_at,
        source: "installed".into(),
        status: "ready".into(),
        error: None,
        manifest,
        body_pose_count,
        face_variant_count,
        mouth_variant_count,
    })
}

fn invalid_package_summary(path: &Path, error: String) -> CharacterPackage {
    let manifest = read_manifest(&path.join("manifest.json")).unwrap_or(Value::Null);
    let package_id = manifest
        .get("package_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "unknown".into());
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_owned();
    let display_name = manifest
        .get("display_name")
        .and_then(Value::as_str)
        .or_else(|| manifest.get("name").and_then(Value::as_str))
        .unwrap_or(&package_id)
        .to_owned();
    let imported_at = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let body_pose_count = state_group(&manifest, "body").map_or(0, |states| states.len());
    let face_variant_count = state_group(&manifest, "face").map_or(0, |states| states.len());
    let mouth_variant_count = state_group(&manifest, "mouth").map_or(0, |states| states.len());
    CharacterPackage {
        package_id: package_id.clone(),
        version,
        character_id: package_id.clone(),
        display_name,
        architecture: None,
        canvas: manifest.get("canvas").cloned(),
        author: manifest
            .get("author")
            .and_then(Value::as_str)
            .map(str::to_owned),
        description: manifest
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned),
        preview_path: None,
        installed_path: path.to_string_lossy().into_owned(),
        imported_at,
        source: "installed".into(),
        status: "error".into(),
        error: Some(error),
        manifest,
        body_pose_count,
        face_variant_count,
        mouth_variant_count,
    }
}

fn public_package(mut package: CharacterPackage, source: &str) -> CharacterPackage {
    package.source = source.into();
    package
}

fn safe_zip_path(name: &str) -> Result<PathBuf, String> {
    let normalized = name.replace('\\', "/");
    let path = Path::new(&normalized);
    if normalized.is_empty() || path.is_absolute() {
        return Err(format!("unsafe ZIP path: {name}"));
    }
    if normalized.contains('\0')
        || normalized
            .split('/')
            .next()
            .is_some_and(|part| part.ends_with(':'))
    {
        return Err(format!("unsafe ZIP path: {name}"));
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(format!("unsafe ZIP path: {name}"));
        }
    }
    Ok(path.to_path_buf())
}

fn find_manifest(root: &Path) -> Result<PathBuf, String> {
    let mut manifests = Vec::new();
    fn walk(path: &Path, manifests: &mut Vec<PathBuf>) -> io::Result<()> {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let child = entry.path();
            if child.is_dir() {
                walk(&child, manifests)?;
            } else if child
                .file_name()
                .is_some_and(|name| name == "manifest.json")
            {
                manifests.push(child);
            }
        }
        Ok(())
    }
    walk(root, &mut manifests).map_err(|error| format!("unable to inspect package: {error}"))?;
    match manifests.as_slice() {
        [manifest] => Ok(manifest.clone()),
        [] => Err("package does not contain manifest.json".into()),
        _ => Err("package contains more than one manifest.json".into()),
    }
}

fn extract_zip(zip_path: &Path) -> Result<TempDir, String> {
    let file = fs::File::open(zip_path).map_err(|error| format!("unable to open ZIP: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("invalid ZIP: {error}"))?;
    let temp = tempfile::tempdir()
        .map_err(|error| format!("unable to create temporary directory: {error}"))?;
    let mut paths = HashSet::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("unable to read ZIP entry: {error}"))?;
        let relative = safe_zip_path(entry.name())?;
        if !paths.insert(relative.clone()) {
            return Err(format!("ZIP contains duplicate path: {}", entry.name()));
        }
        let destination = temp.path().join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination)
                .map_err(|error| format!("unable to extract directory: {error}"))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("unable to extract package: {error}"))?;
        }
        let mut output = fs::File::create(&destination)
            .map_err(|error| format!("unable to extract package: {error}"))?;
        io::copy(&mut entry, &mut output)
            .map_err(|error| format!("unable to extract package: {error}"))?;
    }
    Ok(temp)
}

#[tauri::command]
fn character_library_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(ensure_library(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_character_library_dir(app: tauri::AppHandle) -> Result<String, String> {
    character_library_dir(app)
}

#[tauri::command]
fn list_character_packages(app: tauri::AppHandle) -> Result<Vec<CharacterPackage>, String> {
    let root = ensure_library(&app)?;
    let mut packages = Vec::new();
    for entry in
        fs::read_dir(root).map_err(|error| format!("unable to list character library: {error}"))?
    {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(".import-"))
            {
                continue;
            }
            match package_from_manifest(&path) {
                Ok(package) => packages.push(public_package(package, "installed")),
                Err(error) => packages.push(invalid_package_summary(
                    &path,
                    format!(
                        "managed character package is missing or damaged ({}): {error}",
                        path.display()
                    ),
                )),
            }
        }
    }
    packages.sort_by(|left, right| left.package_id.cmp(&right.package_id));
    Ok(packages)
}

#[tauri::command]
fn validate_character_package(path: String) -> Result<PackageValidation, String> {
    let candidate = PathBuf::from(path);
    let package_root = if candidate.is_dir() {
        candidate.clone()
    } else if candidate
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        let temp = extract_zip(&candidate)?;
        let manifest = find_manifest(temp.path())?;
        let root = manifest
            .parent()
            .ok_or("manifest has no package directory")?
            .to_path_buf();
        let mut result = validate_manifest(&read_manifest(&manifest)?);
        if result.valid {
            if let Err(error) = package_from_manifest(&root) {
                result.valid = false;
                result.errors.push(error);
            }
        }
        return Ok(result);
    } else {
        return Err("select a character package directory or ZIP file".into());
    };
    let mut result = validate_manifest(&read_manifest(&package_root.join("manifest.json"))?);
    if result.valid {
        if let Err(error) = package_from_manifest(&package_root) {
            result.valid = false;
            result.errors.push(error);
        }
    }
    Ok(result)
}

#[tauri::command]
fn get_character_package_metadata(path: String) -> Result<CharacterPackage, String> {
    let candidate = PathBuf::from(path);
    if !candidate.is_dir() {
        return Err("package metadata requires an extracted package directory".into());
    }
    package_from_manifest(&candidate)
}

#[tauri::command]
fn preview_character_package(source_path: String) -> Result<CharacterPackage, String> {
    let temp = extract_zip(Path::new(&source_path))?;
    let manifest_path = find_manifest(temp.path())?;
    let package_root = manifest_path
        .parent()
        .ok_or("manifest has no package directory")?;
    Ok(public_package(
        package_from_manifest(package_root)?,
        "bundled",
    ))
}

#[tauri::command]
fn install_character_package(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<CharacterPackage, String> {
    let temp = extract_zip(Path::new(&source_path))?;
    let manifest_path = find_manifest(temp.path())?;
    let package_root = manifest_path
        .parent()
        .ok_or("manifest has no package directory")?;
    let package = package_from_manifest(package_root)?;
    let library = ensure_library(&app)?;
    if list_character_packages(app.clone())?
        .iter()
        .any(|item| item.character_id == package.character_id && item.version == package.version)
    {
        return Err(format!(
            "character package already installed: {} {}",
            package.character_id, package.version
        ));
    }
    let destination_name = package.package_id.replace(
        |character: char| {
            !character.is_ascii_alphanumeric() && character != '-' && character != '_'
        },
        "_",
    );
    let destination = library.join(destination_name);
    if destination.exists() {
        return Err("managed package destination already exists; refusing to overwrite it".into());
    }
    let staging = tempfile::Builder::new()
        .prefix(".import-")
        .tempdir_in(&library)
        .map_err(|error| format!("unable to create package staging directory: {error}"))?;
    let staged_package = staging.path().join("package");
    fs::create_dir(&staged_package).map_err(|error| format!("unable to stage package: {error}"))?;
    copy_dir(package_root, &staged_package)?;
    package_from_manifest(&staged_package)?;
    fs::rename(&staged_package, &destination)
        .map_err(|error| format!("unable to finalize package import: {error}"))?;
    let mut installed = package;
    installed.installed_path = destination.to_string_lossy().into_owned();
    installed.source = "installed".into();
    Ok(installed)
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn remove_character_package(
    app: tauri::AppHandle,
    character_id: String,
    version: String,
) -> Result<(), String> {
    let root = ensure_library(&app)?;
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir()
            && package_from_manifest(&path)
                .map(|item| item.character_id == character_id && item.version == version)
                .unwrap_or(false)
        {
            if path.parent() != Some(root.as_path()) {
                return Err("refusing to remove a path outside managed character storage".into());
            }
            fs::remove_dir_all(path)
                .map_err(|error| format!("unable to remove package: {error}"))?;
            return Ok(());
        }
    }
    Err(format!(
        "character package is not installed: {character_id} {version}"
    ))
}

#[tauri::command]
fn is_character_package_installed(
    app: tauri::AppHandle,
    package_id: String,
) -> Result<bool, String> {
    Ok(list_character_packages(app)?
        .iter()
        .any(|package| package.package_id == package_id || package.character_id == package_id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            character_library_dir,
            get_character_library_dir,
            list_character_packages,
            validate_character_package,
            get_character_package_metadata,
            preview_character_package,
            install_character_package,
            remove_character_package,
            is_character_package_installed
        ])
        .run(tauri::generate_context!())
        .expect("error while running Re:Anime");
}

#[cfg(test)]
mod tests {
    use super::{invalid_package_summary, package_from_manifest, validate_manifest};
    use serde_json::Value;
    use std::fs;

    const REZE_MANIFEST: &str = include_str!("../../public/assets/characters/reze/manifest.json");
    fn create_reze_package() -> tempfile::TempDir {
        let manifest: Value = serde_json::from_str(REZE_MANIFEST).unwrap();
        let package_root = tempfile::tempdir().unwrap();
        fs::write(package_root.path().join("manifest.json"), REZE_MANIFEST).unwrap();
        let source_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../public/assets/characters/reze");
        for path in manifest["assets"].as_object().unwrap().keys() {
            let destination = package_root.path().join(path);
            fs::create_dir_all(destination.parent().unwrap()).unwrap();
            fs::copy(source_root.join(path), destination).unwrap();
        }
        fs::copy(
            source_root.join("calibration.json"),
            package_root.path().join("calibration.json"),
        )
        .unwrap();
        package_root
    }

    #[test]
    fn actual_reze_manifest_uses_layer_ids_as_metadata_and_validates_asset_paths() {
        let manifest: Value = serde_json::from_str(REZE_MANIFEST).unwrap();
        assert!(validate_manifest(&manifest).valid);
        assert!(manifest["rig"]["layers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|layer| layer["id"] == "body"));
        assert_eq!(manifest["states"]["body"]["neutral"], "body/neutral.png");
        assert!(manifest["assets"].get("body/neutral.png").is_some());
        assert!(manifest["assets"].get("body").is_none());

        let package_root = create_reze_package();
        let package = package_from_manifest(package_root.path()).unwrap();
        assert_eq!(package.body_pose_count, 10);
        assert_eq!(package.face_variant_count, 13);

        fs::remove_file(package_root.path().join("body/neutral.png")).unwrap();
        let error = package_from_manifest(package_root.path()).unwrap_err();
        assert!(error.contains("manifest references missing asset: body/neutral.png"));
    }

    #[test]
    fn every_required_asset_group_rejects_missing_pngs() {
        for missing in [
            "body/neutral.png",
            "head/head.png",
            "face/normal_open.png",
            "mouth/neutral.png",
        ] {
            let package_root = create_reze_package();
            fs::remove_file(package_root.path().join(missing)).unwrap();
            let error = package_from_manifest(package_root.path()).unwrap_err();
            assert!(error.contains(&format!("manifest references missing asset: {missing}")));
        }
    }

    #[test]
    fn damaged_managed_packages_are_reported_without_being_treated_as_ready() {
        let package_root = tempfile::tempdir().unwrap();
        fs::write(package_root.path().join("manifest.json"), "{ invalid json").unwrap();
        let summary =
            invalid_package_summary(package_root.path(), "manifest is not valid JSON".into());
        assert_eq!(summary.status, "error");
        assert!(summary
            .error
            .unwrap()
            .contains("manifest is not valid JSON"));
    }

    #[test]
    fn invalid_png_image_data_is_rejected() {
        let package_root = create_reze_package();
        fs::write(package_root.path().join("body/neutral.png"), b"not a PNG").unwrap();
        let error = package_from_manifest(package_root.path()).unwrap_err();
        assert!(error.contains("not a readable PNG"));
    }

    #[test]
    fn canonical_validator_rejects_unsupported_rigs_and_unsafe_paths() {
        let mut manifest: Value = serde_json::from_str(REZE_MANIFEST).unwrap();
        manifest["rig"]["type"] = Value::String("skeletal".into());
        assert!(!validate_manifest(&manifest).valid);

        let mut manifest: Value = serde_json::from_str(REZE_MANIFEST).unwrap();
        manifest["states"]["body"]["neutral"] = Value::String("../neutral.png".into());
        assert!(!validate_manifest(&manifest).valid);

        let mut manifest: Value = serde_json::from_str(REZE_MANIFEST).unwrap();
        manifest["schema_version"] = Value::String("0.2".into());
        assert!(!validate_manifest(&manifest).valid);
    }

    #[test]
    fn invalid_calibration_is_rejected() {
        let package_root = create_reze_package();
        let calibration_path = package_root.path().join("calibration.json");
        let mut calibration: Value =
            serde_json::from_slice(&fs::read(&calibration_path).unwrap()).unwrap();
        calibration["layers"]["body"]["scaleX"] = Value::from(-1);
        fs::write(&calibration_path, calibration.to_string()).unwrap();
        let error = package_from_manifest(package_root.path()).unwrap_err();
        assert!(error.contains("scale must be positive"));
    }
}
