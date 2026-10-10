use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io,
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
    pub source: String,
    pub character: Option<String>,
    pub manifest: Value,
    pub body_pose_count: usize,
    pub face_variant_count: usize,
    pub mouth_variant_count: usize,
    pub hands_pose_count: usize,
    pub left_arm_pose_count: usize,
    pub right_arm_pose_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageValidation {
    pub valid: bool,
    pub package_id: Option<String>,
    pub version: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct PackageIdentity {
    #[serde(alias = "packageId")]
    package_id: Option<String>,
    #[serde(alias = "packageVersion")]
    version: Option<String>,
    character: Option<String>,
}

fn library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LIBRARY_NAME))
        .map_err(|error| format!("unable to determine app data directory: {error}"))
}

fn ensure_library(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = library_dir(app)?;
    fs::create_dir_all(&path).map_err(|error| format!("unable to create character library: {error}"))?;
    Ok(path)
}

fn read_manifest(path: &Path) -> Result<(PackageIdentity, Value), String> {
    let bytes = fs::read(path).map_err(|error| format!("unable to read manifest: {error}"))?;
    let manifest: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("manifest is not valid JSON: {error}"))?;
    let identity: PackageIdentity = serde_json::from_value(manifest.clone())
        .map_err(|error| format!("manifest has invalid metadata: {error}"))?;
    Ok((identity, manifest))
}

fn validate_manifest(manifest: &Value) -> PackageValidation {
    let mut errors = Vec::new();
    let identity: Option<PackageIdentity> = serde_json::from_value(manifest.clone()).ok();
    let (package_id, version, character) = match identity {
        Some(value) => (value.package_id, value.version, value.character),
        None => (None, None, None),
    };
    if package_id.as_deref().map(str::trim).unwrap_or("").is_empty() {
        errors.push("manifest must contain a non-empty package_id or packageId".into());
    }
    if version.as_deref().map(str::trim).unwrap_or("").is_empty() {
        errors.push("manifest must contain a non-empty version or packageVersion".into());
    }
    if !manifest.get("assets").map(Value::is_object).unwrap_or(false) {
        errors.push("manifest must contain an assets object".into());
    }
    PackageValidation {
        valid: errors.is_empty(),
        package_id,
        version,
        errors,
    }
}

fn package_from_manifest(path: &Path) -> Result<CharacterPackage, String> {
    let (identity, manifest) = read_manifest(&path.join("manifest.json"))?;
    let validation = validate_manifest(&manifest);
    if !validation.valid {
        return Err(validation.errors.join("; "));
    }
    let package_id = validation.package_id.unwrap();
    let version = validation.version.unwrap();
    let character = identity.character.clone();
    let character_id = character.clone().unwrap_or_else(|| {
        let lower = package_id.to_ascii_lowercase();
        lower.split("_character").next().unwrap_or(&lower).to_owned()
    });
    let assets = if let Some(value) = manifest.get("assets").and_then(Value::as_object) {
        value.clone()
    } else if manifest.get("architecture").is_some() && manifest.get("renderer").is_some() {
        let mut discovered = serde_json::Map::new();
        collect_png_assets(path, path, &mut discovered)?;
        if !discovered.contains_key("body/neutral.png")
            || !discovered.contains_key("head/base.png")
            || !discovered.keys().any(|key| key.starts_with("face/") && key != "face/source_sheet.png")
            || !discovered.keys().any(|key| key.starts_with("mouths/"))
        {
            return Err("canonical package is missing body, head, face, or mouth assets".into());
        }
        let left = discovered.keys().filter(|key| key.starts_with("hands/left/")).count();
        let right = discovered.keys().filter(|key| key.starts_with("hands/right/")).count();
        if left == 0 || left != right {
            return Err("canonical package must contain matching left and right arm pose assets".into());
        }
        discovered
    } else {
        return Err("manifest must contain an assets object or canonical architecture metadata".into());
    };
    let calibration_path = path.join("calibration.json");
    if !calibration_path.is_file() {
        return Err("missing calibration.json".into());
    }
    let calibration: Value = serde_json::from_slice(&fs::read(&calibration_path).map_err(|error| error.to_string())?)
        .map_err(|error| format!("calibration is not valid JSON: {error}"))?;
    let calibration_character = calibration.get("character").and_then(Value::as_str)
        .or_else(|| calibration.get("characterId").and_then(Value::as_str))
        .or_else(|| calibration.get("package_id").and_then(Value::as_str).map(|value| value.trim_end_matches("_character")));
    let calibration_version = calibration.get("packageVersion").and_then(Value::as_str)
        .or_else(|| calibration.get("version").and_then(Value::as_str));
    if (calibration.get("schemaVersion").is_some() && calibration.get("schemaVersion").and_then(Value::as_u64) != Some(1))
        || calibration_character != Some(character_id.as_str())
        || calibration_version != Some(version.as_str())
    {
        return Err("calibration.json schema or package version is incompatible".into());
    }
    let body_pose_count = assets
        .keys()
        .filter(|key| key.starts_with("body/") && key.ends_with(".png"))
        .count();
    let face_variant_count = assets
        .keys()
        .filter(|key| key.starts_with("face/") && key.ends_with(".png"))
        .count();
    let mouth_variant_count = assets
        .keys()
        .filter(|key| key.starts_with("mouths/") && key.ends_with(".png"))
        .count();
    let hands_pose_count = assets
        .keys()
        .filter(|key| key.starts_with("hands/") && !key.starts_with("hands/left/") && !key.starts_with("hands/right/") && !key.starts_with("hands/paired_reference/") && key.ends_with(".png"))
        .count();
    for asset in assets.keys().filter(|key| key.starts_with("hands/")) {
        if !asset.ends_with(".png") || asset.starts_with("hands/paired_reference/") && !path.join(asset).is_file() {
            return Err(format!("invalid hands asset: {asset}"));
        }
    }
    let left_arm_pose_count = assets.keys().filter(|key| key.starts_with("hands/left/") && key.ends_with(".png")).count();
    let right_arm_pose_count = assets.keys().filter(|key| key.starts_with("hands/right/") && key.ends_with(".png")).count();
    let architecture = manifest.get("renderer_architecture")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" + "))
        .or_else(|| manifest.get("architecture").and_then(Value::as_str).map(str::to_owned));
    let display_name = manifest
        .get("displayName")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| character.clone())
        .unwrap_or_else(|| "Character".into());
    let canvas = manifest.get("canvas").cloned();
    let author = manifest.get("author").and_then(Value::as_str).map(str::to_owned);
    let description = manifest.get("description").and_then(Value::as_str).map(str::to_owned);
    let preview_path = fs::read_dir(path.join("preview")).ok()
        .and_then(|entries| entries.flatten().map(|entry| entry.path()).find(|item| item.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("png"))))
        .map(|item| item.to_string_lossy().into_owned());
    Ok(CharacterPackage {
        package_id,
        version,
        character_id,
        display_name,
        architecture,
        canvas,
        author,
        description,
        preview_path,
        installed_path: path.to_string_lossy().into_owned(),
        source: "installed".into(),
        character,
        manifest,
        body_pose_count,
        face_variant_count,
        mouth_variant_count,
        hands_pose_count,
        left_arm_pose_count,
        right_arm_pose_count,
    })
}

fn collect_png_assets(root: &Path, directory: &Path, assets: &mut serde_json::Map<String, Value>) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_png_assets(root, &path, assets)?;
        } else if path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("png")) {
            let relative = path.strip_prefix(root).map_err(|error| error.to_string())?.to_string_lossy().replace('\\', "/");
            assets.insert(relative, serde_json::json!({ "format": "PNG" }));
        }
    }
    Ok(())
}

fn write_resource_index(path: &Path) -> Result<(), String> {
    let mut assets = serde_json::Map::new();
    collect_png_assets(path, path, &mut assets)?;
    fs::write(path.join("resource-index.json"), serde_json::to_vec_pretty(&serde_json::json!({ "assets": assets })).map_err(|error| error.to_string())?)
        .map_err(|error| format!("unable to write resource index: {error}"))
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
    if normalized.contains('\0') || normalized.split('/').next().is_some_and(|part| part.ends_with(':')) {
        return Err(format!("unsafe ZIP path: {name}"));
    }
    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
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
            } else if child.file_name().is_some_and(|name| name == "manifest.json") {
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
    let temp = tempfile::tempdir().map_err(|error| format!("unable to create temporary directory: {error}"))?;
    let mut paths = HashSet::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| format!("unable to read ZIP entry: {error}"))?;
        let relative = safe_zip_path(entry.name())?;
        if !paths.insert(relative.clone()) {
            return Err(format!("ZIP contains duplicate path: {}", entry.name()));
        }
        let destination = temp.path().join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| format!("unable to extract directory: {error}"))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("unable to extract package: {error}"))?;
        }
        let mut output = fs::File::create(&destination).map_err(|error| format!("unable to extract package: {error}"))?;
        io::copy(&mut entry, &mut output).map_err(|error| format!("unable to extract package: {error}"))?;
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
    for entry in fs::read_dir(root).map_err(|error| format!("unable to list character library: {error}"))? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() {
            if let Ok(package) = package_from_manifest(&path) {
                packages.push(public_package(package, "installed"));
            }
        }
    }
    packages.sort_by(|left, right| left.package_id.cmp(&right.package_id));
    Ok(packages)
}

#[tauri::command]
fn validate_character_package(path: String) -> Result<PackageValidation, String> {
    let candidate = PathBuf::from(path);
    if candidate.is_dir() {
        return Ok(validate_manifest(&read_manifest(&candidate.join("manifest.json"))?.1));
    }
    if candidate.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("zip")) {
        let temp = extract_zip(&candidate)?;
        let manifest = find_manifest(temp.path())?;
        return Ok(validate_manifest(&read_manifest(&manifest)?.1));
    }
    Ok(validate_manifest(&read_manifest(&candidate)?.1))
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
    let package_root = manifest_path.parent().ok_or("manifest has no package directory")?;
    Ok(public_package(package_from_manifest(package_root)?, "bundled"))
}

#[tauri::command]
fn install_character_package(app: tauri::AppHandle, source_path: String) -> Result<CharacterPackage, String> {
    let temp = extract_zip(Path::new(&source_path))?;
    let manifest_path = find_manifest(temp.path())?;
    let package_root = manifest_path.parent().ok_or("manifest has no package directory")?;
    let package = package_from_manifest(package_root)?;
    let library = ensure_library(&app)?;
    if list_character_packages(app.clone())?.iter().any(|item| {
        item.character_id == package.character_id && item.version == package.version
    }) {
        return Err(format!("character package already installed: {} {}", package.character_id, package.version));
    }
    let destination_name = package.package_id.replace(|character: char| !character.is_ascii_alphanumeric() && character != '-' && character != '_', "_");
    let destination = library.join(destination_name);
    fs::create_dir(&destination).map_err(|error| format!("unable to create package directory: {error}"))?;
    copy_dir(package_root, &destination)?;
    write_resource_index(&destination)?;
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
fn remove_character_package(app: tauri::AppHandle, character_id: String, version: String) -> Result<(), String> {
    let root = ensure_library(&app)?;
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() && package_from_manifest(&path)
            .map(|item| item.character_id == character_id && item.version == version)
            .unwrap_or(false) {
            fs::remove_dir_all(path).map_err(|error| format!("unable to remove package: {error}"))?;
            return Ok(());
        }
    }
    Err(format!("character package is not installed: {character_id} {version}"))
}

#[tauri::command]
fn is_character_package_installed(app: tauri::AppHandle, package_id: String) -> Result<bool, String> {
    Ok(list_character_packages(app)?.iter().any(|package| package.package_id == package_id || package.character_id == package_id))
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
