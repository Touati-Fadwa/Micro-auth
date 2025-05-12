pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    KUBECONFIG = "${env.WORKSPACE}/k3s-config.yaml"  // Chemin dans l'espace de travail
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Create Kubernetes Secrets') {
      steps {
        script {
          withCredentials([
            string(credentialsId: 'JWT_SECRET_CREDENTIALS', variable: 'JWT_SECRET'),
            usernamePassword(
              credentialsId: 'DB_CREDENTIALS',
              usernameVariable: 'DB_USER',
              passwordVariable: 'DB_PASSWORD'
            )
          ]) {
            sh '''
              sed -i "s/{{JWT_SECRET}}/${JWT_SECRET}/g" k8s/secrets.yaml
              sed -i "s/{{DB_USER}}/${DB_USER}/g" k8s/secrets.yaml
              sed -i "s/{{DB_PASSWORD}}/${DB_PASSWORD}/g" k8s/secrets.yaml
              kubectl apply -f k8s/secrets.yaml --kubeconfig=${KUBECONFIG}
            '''
          }
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh '''
              # Copier le fichier de configuration exactement comme stocké dans Jenkins
              cp "${K3S_CONFIG_FILE}" "${KUBECONFIG}"
              chmod 600 "${KUBECONFIG}"
              
              # Vérification basique de la configuration
              kubectl --kubeconfig=${KUBECONFIG} config view
              
              # Vérification de la connexion au cluster
              if ! kubectl --kubeconfig=${KUBECONFIG} cluster-info; then
                echo "ERREUR: La configuration K3S_CONFIG ne permet pas de se connecter au cluster"
                exit 1
              fi
              
              # Création du namespace si inexistant
              kubectl --kubeconfig=${KUBECONFIG} create namespace ${KUBE_NAMESPACE} --dry-run=client -o yaml | kubectl --kubeconfig=${KUBECONFIG} apply -f -
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh '''
              # Déploiement avec validation forcée
              kubectl --kubeconfig=${KUBECONFIG} apply -f k8s/bibliotheque-auth-deployment.yaml --validate=false
              kubectl --kubeconfig=${KUBECONFIG} apply -f k8s/bibliotheque-auth-service.yaml --validate=false
              
              # Attente du déploiement
              kubectl --kubeconfig=${KUBECONFIG} rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} --timeout=300s
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
            sh '''
              # Vérification complète
              echo "=== État du déploiement ==="
              kubectl --kubeconfig=${KUBECONFIG} get deploy -n ${KUBE_NAMESPACE} -o wide
              
              echo "=== Détails du service ==="
              kubectl --kubeconfig=${KUBECONFIG} get svc -n ${KUBE_NAMESPACE}
              
              echo "=== Logs des pods ==="
              kubectl --kubeconfig=${KUBECONFIG} logs -n ${KUBE_NAMESPACE} -l app=bibliotheque-auth --tail=50 || true
              
              # Génération URL d'accès
              NODE_IP=$(kubectl --kubeconfig=${KUBECONFIG} get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl --kubeconfig=${KUBECONFIG} get svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "NON_DISPONIBLE")
              
              if [ "${NODE_PORT}" != "NON_DISPONIBLE" ]; then
                echo "Application accessible à: http://${NODE_IP}:${NODE_PORT}"
              else
                echo "Service non prêt"
              fi
            '''
          }
        }
      }
    }
  }

  post {
    always {
      sh '''
        # Nettoyage sécurisé
        docker logout ${REGISTRY} || true
        rm -f "${KUBECONFIG}" || true
      '''
      echo "Pipeline terminé avec le statut: ${currentBuild.result}"
    }
    
    failure {
      script {
        echo "Échec du pipeline! Tentative de rollback..."
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'K3S_CONFIG_FILE')]) {
          sh '''
            kubectl --kubeconfig=${KUBECONFIG} rollout undo deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
            sleep 10
            kubectl --kubeconfig=${KUBECONFIG} rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
          '''
        }
      }
    }
  }
}