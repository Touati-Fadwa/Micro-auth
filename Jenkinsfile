pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
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
              kubectl apply -f k8s/secrets.yaml
            '''
          }
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Configuration sécurisée de kubectl
              mkdir -p ~/.kube
              echo "${KUBECONFIG_CONTENT}" > ~/.kube/config-${BUILD_NUMBER}
              chmod 600 ~/.kube/config-${BUILD_NUMBER}
              export KUBECONFIG=~/.kube/config-${BUILD_NUMBER}
              
              # Création du namespace
              kubectl create namespace ${KUBE_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
              
              # Vérification de la connexion
              echo "=== Cluster Information ==="
              kubectl cluster-info
              echo "=== Nodes ==="
              kubectl get nodes
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Réutilisation de la configuration sécurisée
              export KUBECONFIG=~/.kube/config-${BUILD_NUMBER}
              
              # Configuration du contexte sans accès système
              CURRENT_CONTEXT=$(kubectl config current-context)
              kubectl config set-context ${CURRENT_CONTEXT} --namespace=${KUBE_NAMESPACE}
              
              # Déploiement
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
              kubectl apply -f k8s/bibliotheque-auth-service.yaml
              
              # Attente du déploiement
              kubectl rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} --timeout=300s
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Réutilisation de la configuration sécurisée
              export KUBECONFIG=~/.kube/config-${BUILD_NUMBER}
              
              echo "=== Deployment Status ==="
              kubectl get deploy -n ${KUBE_NAMESPACE} -o wide
              
              echo "=== Service Details ==="
              kubectl get svc -n ${KUBE_NAMESPACE}
              
              echo "=== Pods Status ==="
              kubectl get pods -n ${KUBE_NAMESPACE} -o wide
              
              # Génération de l'URL d'accès
              echo "=== Access Information ==="
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "NOT_AVAILABLE")
              
              if [ "${NODE_PORT}" != "NOT_AVAILABLE" ]; then
                echo "Application accessible at: http://${NODE_IP}:${NODE_PORT}"
              else
                echo "Service not ready - check with: kubectl get svc -n ${KUBE_NAMESPACE}"
                kubectl describe svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} || true
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
        docker logout ${REGISTRY} || true
        rm -f ~/.kube/config-${BUILD_NUMBER} || true
      '''
      echo "Pipeline execution completed"
    }
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
          sh '''
            export KUBECONFIG=~/.kube/config-${BUILD_NUMBER}
            echo "!!! Rolling back deployment !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
            kubectl rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
          '''
        }
      }
    }
  }
}