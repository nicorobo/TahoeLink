.PHONY: certs

certs:
	@which mkcert || (echo "Installing mkcert" && brew install mkcert && mkcert -install)
	@echo "Generating SSL certificates..."
	@mkcert -cert-file localhost.crt -key-file localhost.key localhost 127.0.0.1 ::1
	@echo "Certificates generated."

clean-certs:
	@rm -f localhost.crt localhost.key
	@echo "Certificates removed."