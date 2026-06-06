from app.models.schemas import VLMResponse


def test_vlm_response_schema():
    data = {
        "axes": {
            "x": {"scale": "linear", "ticks": [{"pixel": [10, 390], "value": 0}]},
            "y": {"scale": "linear", "ticks": [{"pixel": [10, 390], "value": 0}]},
        },
        "curves": [
            {
                "label": "Series",
                "color_hex": "#ff0000",
                "style": "solid",
                "seed_points": [[50, 50]],
            }
        ],
        "notes": "",
    }
    resp = VLMResponse.model_validate(data)
    assert resp.curves[0].label == "Series"
