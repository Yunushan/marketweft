use marketweft_core::{
    measure_risk_reward, RiskRewardMeasurement, RiskRewardSide, MAX_TICKS, SCALE,
};

#[test]
fn measures_signed_long_and_short_plans_in_exact_ticks() {
    assert_eq!(
        measure_risk_reward(RiskRewardSide::Long, -2_000_001, -3_000_001, 999_999).unwrap(),
        RiskRewardMeasurement {
            risk_ticks: SCALE,
            reward_ticks: 3 * SCALE,
            reward_per_risk_micros: i128::from(3 * SCALE),
        }
    );
    assert_eq!(
        measure_risk_reward(RiskRewardSide::Short, -2_000_000, -1_500_000, -3_250_000).unwrap(),
        RiskRewardMeasurement {
            risk_ticks: 500_000,
            reward_ticks: 1_250_000,
            reward_per_risk_micros: 2_500_000,
        }
    );
    assert_eq!(
        measure_risk_reward(RiskRewardSide::Long, 0, -2_000_000, 1)
            .unwrap()
            .reward_per_risk_micros,
        1
    );
}

#[test]
fn rejects_misordered_levels_and_keeps_reward_multiple_above_i64() {
    assert!(measure_risk_reward(RiskRewardSide::Long, 0, 0, 1)
        .unwrap_err()
        .contains("stop below"));
    assert!(measure_risk_reward(RiskRewardSide::Short, 0, 1, 2)
        .unwrap_err()
        .contains("target below"));
    assert!(measure_risk_reward(RiskRewardSide::Long, 0, -1, MAX_TICKS + 1).is_err());
    let wide =
        measure_risk_reward(RiskRewardSide::Long, -MAX_TICKS + 1, -MAX_TICKS, MAX_TICKS).unwrap();
    assert_eq!(
        wide.reward_per_risk_micros,
        i128::from(2 * MAX_TICKS - 1) * i128::from(SCALE)
    );
}
