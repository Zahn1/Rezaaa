from app import config, llm


def test_explicit_echo(monkeypatch):
    monkeypatch.setattr(config, "REZAA_PROVIDER", "echo")
    assert llm.build_provider().name == "echo"


def test_explicit_ollama(monkeypatch):
    monkeypatch.setattr(config, "REZAA_PROVIDER", "ollama")
    provider = llm.build_provider()
    assert provider.name == "ollama"
    assert provider.model == config.OLLAMA_MODEL


def test_auto_prefers_ollama_over_echo(monkeypatch):
    monkeypatch.setattr(config, "REZAA_PROVIDER", "auto")
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(llm, "ollama_available", lambda: True)
    assert llm.build_provider().name == "ollama"


def test_auto_falls_back_to_echo(monkeypatch):
    monkeypatch.setattr(config, "REZAA_PROVIDER", "auto")
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(llm, "ollama_available", lambda: False)
    assert llm.build_provider().name == "echo"
