use backend_rs::db::{pg_pool, run_migrations, seed_allowed, seed_user, SocialAuth, User};
use std::env;
use std::sync::Mutex;
use uuid::Uuid;

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn db_url() -> String {
    env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://cypher:cypher@localhost:5433/cypher".into())
}

#[tokio::test]
async fn migrate_then_crud_user() {
    let pool = pg_pool(&db_url());
    run_migrations(&pool).await.expect("migrations should apply");

    let mut tx = pool.begin().await.expect("begin transaction");

    let user_id = Uuid::new_v4();
    let username = format!("testuser_{}", user_id);
    let email = "test@example.com";

    let user: User = sqlx::query_as(
        "INSERT INTO users (
            id, username, email, display_name, npub, avatar_url,
            password_hash, is_active, is_admin, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin",
    )
    .bind(user_id)
    .bind(&username)
    .bind(Some(email))
    .bind(Some("Display Name"))
    .bind::<Option<&str>>(None)
    .bind::<Option<&str>>(None)
    .bind("bcrypt_hash")
    .bind(true)
    .bind(false)
    .fetch_one(&mut *tx)
    .await
    .expect("insert user");

    assert_eq!(user.id, user_id);
    assert_eq!(user.username, username);
    assert_eq!(user.email.as_deref(), Some(email));
    assert_eq!(user.display_name.as_deref(), Some("Display Name"));
    assert!(user.npub.is_none());
    assert!(user.avatar_url.is_none());
    assert_eq!(user.password_hash, "bcrypt_hash");
    assert!(user.is_active);
    assert!(!user.is_admin);

    let selected: User = sqlx::query_as(
        "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
         FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .expect("select user");
    assert_eq!(selected.username, username);

    let social: SocialAuth = sqlx::query_as(
        "INSERT INTO social_auth (id, user_id, provider, uid, extra_data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, user_id, provider, uid",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind("google")
    .bind("google-123")
    .bind(serde_json::json!({}))
    .fetch_one(&mut *tx)
    .await
    .expect("insert social_auth");

    assert_eq!(social.user_id, user_id);
    assert_eq!(social.provider, "google");
    assert_eq!(social.uid, "google-123");

    let conflict = sqlx::query(
        "INSERT INTO social_auth (id, user_id, provider, uid, extra_data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind("google")
    .bind("google-123")
    .bind(serde_json::json!({}))
    .execute(&mut *tx)
    .await;

    match conflict {
        Err(sqlx::Error::Database(db_err)) => assert!(db_err.is_unique_violation()),
        other => panic!("expected unique violation, got {:?}", other),
    }

    tx.rollback().await.expect("rollback");
}

#[tokio::test]
async fn seed_fallback_gated() {
    let _guard = ENV_LOCK.lock().expect("env lock");

    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");

    assert!(!seed_allowed(), "seed should be disallowed by default");
    assert!(seed_user().is_none(), "seed_user should be None when disabled");

    env::set_var("ALLOW_SEED_FALLBACK", "1");
    assert!(
        seed_user().is_none(),
        "seed_user should be None without admin credentials"
    );

    env::set_var("SEED_ADMIN_USER", "seedadmin");
    env::set_var("SEED_ADMIN_PASSWORD", "seedpassword");

    assert!(seed_allowed());
    let user = seed_user().expect("seed user should exist with env set");
    assert_eq!(user.username, "seedadmin");
    assert!(user.is_active);
    assert!(!user.is_admin);
    assert_eq!(user.password_hash, "");

    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");
}
